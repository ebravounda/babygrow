import base64

import httpx
from fastapi import HTTPException

from core import db, decrypt, iso, get_project, get_article
from content import render_html, numeric_claims, jsonld, to_json


def article_url(project, article):
    pattern = project.get("blog_url_pattern")
    if pattern and "{slug}" in pattern:
        return pattern.replace("{slug}", article["slug"])
    return f"{project.get('base_url', '')}/api/blog/{project['id']}/{article['slug']}"


async def push_wordpress(project, article, cfg):
    url = cfg["url"].rstrip("/") + "/wp-json/wp/v2/posts"
    auth = (cfg["user"], decrypt(cfg["app_password_enc"]))
    author = await db.authors.find_one({"_id": article.get("author_id")}) if article.get("author_id") else None
    html = render_html(project, article) + f'<script type="application/ld+json">{to_json(jsonld(project, article, author, article_url(project, article)))}</script>'
    payload = {"title": article["title"], "content": html, "status": "publish", "slug": article["slug"],
               "excerpt": article.get("meta_description", "")}
    async with httpx.AsyncClient(timeout=40) as c:
        if article.get("wp_post_id"):
            r = await c.post(f"{url}/{article['wp_post_id']}", json=payload, auth=auth)
        else:
            r = await c.post(url, json=payload, auth=auth)
    if r.status_code >= 400:
        raise HTTPException(502, f"WordPress respondió {r.status_code}: {r.text[:200]}")
    return {"wp_post_id": r.json().get("id"), "wp_link": r.json().get("link")}


async def shopify_blog_id(cfg):
    if cfg.get("blog_id"):
        return cfg["blog_id"]
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"https://{cfg['shop']}/admin/api/2025-01/blogs.json",
                        headers={"X-Shopify-Access-Token": decrypt(cfg["token_enc"])})
    if r.status_code >= 400 or not r.json().get("blogs"):
        raise HTTPException(502, f"Shopify: no se encontró ningún blog ({r.status_code})")
    return r.json()["blogs"][0]["id"]


async def push_shopify(project, article, cfg):
    blog_id = await shopify_blog_id(cfg)
    payload = {"article": {"title": article["title"], "body_html": render_html(project, article), "handle": article["slug"],
                           "summary_html": article.get("meta_description", ""), "published": True,
                           **({"image": {"src": article["cover_url"]}} if article.get("cover_url") else {})}}
    base = f"https://{cfg['shop']}/admin/api/2025-01/blogs/{blog_id}/articles"
    headers = {"X-Shopify-Access-Token": decrypt(cfg["token_enc"])}
    async with httpx.AsyncClient(timeout=40) as c:
        if article.get("shopify_article_id"):
            payload["article"]["id"] = article["shopify_article_id"]
            r = await c.put(f"{base}/{article['shopify_article_id']}.json", json=payload, headers=headers)
        else:
            r = await c.post(f"{base}.json", json=payload, headers=headers)
    if r.status_code >= 400:
        raise HTTPException(502, f"Shopify respondió {r.status_code}: {r.text[:200]}")
    return {"shopify_article_id": r.json()["article"]["id"]}


def check_publishable(article):
    if numeric_claims(article.get("content", "")) and not article.get("factcheck"):
        raise HTTPException(400, "Este artículo tiene cifras. Ejecuta la verificación de datos antes de publicar.")
    flagged = [c for c in (article.get("factcheck") or []) if c.get("status") != "con_fuente"]
    if flagged and not article.get("facts_approved"):
        raise HTTPException(400, f"Hay {len(flagged)} datos sin fuente o dudosos. Revísalos y dales tu visto bueno.")


async def publish_article(aid):
    article = await get_article(aid)
    project = await get_project(article["project_id"])
    check_publishable(article)
    upd = {"status": "published", "published_at": article.get("published_at") or iso(), "updated_at": iso(), "publish_errors": []}
    integ = project.get("integrations") or {}
    for name, fn in (("wordpress", push_wordpress), ("shopify", push_shopify)):
        cfg = integ.get(name)
        if cfg and cfg.get("enabled"):
            try:
                upd.update(await fn(project, article, cfg))
            except HTTPException as e:
                upd["publish_errors"].append(f"{name}: {e.detail}")
    await db.articles.update_one({"_id": aid}, {"$set": upd})
    if article.get("topic_id"):
        await db.topics.update_one({"_id": article["topic_id"]}, {"$set": {"status": "publicado"}})
    return await get_article(aid)


async def test_integration(name, cfg):
    async with httpx.AsyncClient(timeout=25) as c:
        if name == "wordpress":
            tok = base64.b64encode(f"{cfg['user']}:{decrypt(cfg['app_password_enc'])}".encode()).decode()
            r = await c.get(cfg["url"].rstrip("/") + "/wp-json/wp/v2/users/me", headers={"Authorization": f"Basic {tok}"})
            ok = r.status_code < 400
            return {"ok": ok, "detail": r.json().get("name") if ok else r.text[:200]}
        r = await c.get(f"https://{cfg['shop']}/admin/api/2025-01/blogs.json", headers={"X-Shopify-Access-Token": decrypt(cfg["token_enc"])})
        ok = r.status_code < 400
        return {"ok": ok, "detail": ", ".join(b["title"] for b in r.json().get("blogs", [])) if ok else r.text[:200]}
