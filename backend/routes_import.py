import re
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException
from markdownify import markdownify
from pydantic import BaseModel

from core import db, new_id, iso, slugify, current_user, get_project, get_article
from content import extract_faq, extract_key_points, score_article
from publisher import publish_article
from routes_articles import has_image_key, start_covers

router = APIRouter(prefix="/api")
UA = {"User-Agent": "Mozilla/5.0 (compatible; MotorSEO-Import/1.0)"}


async def fetch(url):
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=UA) as c:
            r = await c.get(url)
        r.raise_for_status()
        return r.text
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer {url}: {str(e)[:120]}")


def slug_from(url):
    return slugify(urlparse(url).path.rstrip("/").split("/")[-1] or "articulo")


async def sitemap_urls(xml, depth=0):
    s = BeautifulSoup(xml, "html.parser")
    locs = [l.get_text(strip=True) for l in s.find_all("loc")]
    if s.find("sitemapindex") and depth < 1:
        out = []
        for sm in locs[:8]:
            out += await sitemap_urls(await fetch(sm), depth + 1)
        return out
    return locs


class ScanIn(BaseModel):
    url: str


@router.post("/projects/{pid}/import/scan")
async def scan(pid: str, body: ScanIn, user=Depends(current_user)):
    await get_project(pid)
    url = body.url.strip()
    text = await fetch(url)
    if "<urlset" in text or "<sitemapindex" in text:
        urls = await sitemap_urls(text)
    else:
        host = urlparse(url).netloc
        s = BeautifulSoup(text, "html.parser")
        urls = [urljoin(url, a["href"]).split("#")[0] for a in s.find_all("a", href=True)]
        urls = [u for u in urls if urlparse(u).netloc == host]
    posts = [u for u in urls if re.search(r"/(blog|articulos?|noticias|posts?)/[^/]+/?$", urlparse(u).path)]
    urls = list(dict.fromkeys(posts or urls or [url]))[:100]
    existing = {a["slug"] async for a in db.articles.find({"project_id": pid}, {"slug": 1})}
    return [{"url": u, "slug": slug_from(u), "exists": slug_from(u) in existing} for u in urls]


def extract(html, url):
    s = BeautifulSoup(html, "html.parser")
    og = s.find("meta", property="og:title")
    desc = s.find("meta", attrs={"name": "description"})
    for t in s(["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "iframe", "svg"]):
        t.decompose()
    main = s.find("article") or s.find("main") or s.find(id="root") or s.body
    h1 = (main.find("h1") if main else None) or s.find("h1")
    title = (h1.get_text(" ", strip=True) if h1 else "") or (og.get("content") if og else "") or (s.title.string if s.title else "")
    if h1:
        h1.decompose()
    md = markdownify(str(main), heading_style="ATX", strip=["img"]) if main else ""
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    return title.strip(), (desc.get("content") if desc else "") or "", md


class ImportItem(BaseModel):
    url: str
    title: str = ""
    content: str = ""


class ImportIn(BaseModel):
    items: list[ImportItem]
    publish: bool = False
    covers: bool = True


@router.post("/projects/{pid}/import")
async def do_import(pid: str, body: ImportIn, user=Depends(current_user)):
    p = await get_project(pid)
    results, created = [], []
    for it in body.items[:50]:
        slug = slug_from(it.url)
        if await db.articles.find_one({"project_id": pid, "slug": slug}):
            results.append({"url": it.url, "status": "exists"})
            continue
        title, desc, md = it.title.strip(), "", it.content.strip()
        if not md:
            try:
                t2, desc, md = extract(await fetch(it.url), it.url)
                title = title or t2
            except HTTPException as e:
                results.append({"url": it.url, "status": "error", "error": e.detail})
                continue
        if len(md) < 400 or not title:
            results.append({"url": it.url, "slug": slug, "status": "needs_content", "title": it.title,
                            "error": "No se pudo leer el texto (la página se carga con JavaScript). Pega el contenido."})
            continue
        first = next((l for l in md.split("\n") if len(l.strip()) > 60 and not l.startswith("#")), "")
        excerpt = re.sub(r"[*_\[\]()#>`]", "", first)[:220]
        aid = new_id()
        art = {"_id": aid, "project_id": pid, "topic_id": None, "title": title[:200], "keyword": None, "intent": None,
               "type": "importado", "cluster": None, "status": "review", "content": md, "slug": slug,
               "meta_title": title[:70], "meta_description": (desc or excerpt)[:170], "excerpt": excerpt,
               "faq": extract_faq(md), "key_points": extract_key_points(md), "imported": True, "source_url": it.url,
               "interview": [], "author_id": None, "provider": None, "created_at": iso(), "updated_at": iso()}
        art["score"] = score_article(p, {**art, "id": aid})
        await db.articles.insert_one(art)
        res = {"url": it.url, "slug": slug, "status": "imported", "article_id": aid, "title": title}
        if body.publish:
            try:
                await publish_article(aid)
                res["published"] = True
            except Exception as e:
                res["publish_error"] = str(getattr(e, "detail", e))[:200]
        created.append(aid)
        results.append(res)
    covers = bool(body.covers and created and await has_image_key() and start_covers(pid, created))
    return {"results": results, "covers_started": covers}
