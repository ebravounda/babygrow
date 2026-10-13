import asyncio
import re
import time
from datetime import timedelta
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException

from core import db, clean, new_id, iso, now, encrypt, current_user, get_project, get_key
from llm import complete, LABELS
from publisher import test_integration

router = APIRouter(prefix="/api")
UA = {"User-Agent": "Mozilla/5.0 (compatible; MotorSEO/1.0)"}


# ---------- Integrations (WordPress / Shopify) ----------
@router.put("/projects/{pid}/integrations/{name}")
async def save_integration(pid: str, name: str, body: dict, user=Depends(current_user)):
    if name not in ("wordpress", "shopify"):
        raise HTTPException(404, "Integración desconocida")
    p = await get_project(pid)
    cur = (p.get("integrations") or {}).get(name, {})
    if name == "wordpress":
        cfg = {"url": body.get("url", cur.get("url", "")).strip(), "user": body.get("user", cur.get("user", "")).strip(),
               "enabled": bool(body.get("enabled", cur.get("enabled", True)))}
        secret = body.get("app_password", "").strip()
        cfg["app_password_enc"] = encrypt(secret) if secret else cur.get("app_password_enc")
        if not cfg["app_password_enc"]:
            raise HTTPException(400, "Falta la contraseña de aplicación")
    else:
        shop = body.get("shop", cur.get("shop", "")).strip().replace("https://", "").strip("/")
        cfg = {"shop": shop, "blog_id": body.get("blog_id", cur.get("blog_id", "")), "enabled": bool(body.get("enabled", cur.get("enabled", True)))}
        secret = body.get("token", "").strip()
        cfg["token_enc"] = encrypt(secret) if secret else cur.get("token_enc")
        if not cfg["token_enc"]:
            raise HTTPException(400, "Falta el token de Shopify")
    await db.projects.update_one({"_id": pid}, {"$set": {f"integrations.{name}": cfg}})
    return {"ok": True}


@router.delete("/projects/{pid}/integrations/{name}")
async def del_integration(pid: str, name: str, user=Depends(current_user)):
    await db.projects.update_one({"_id": pid}, {"$unset": {f"integrations.{name}": ""}})
    return {"ok": True}


@router.post("/projects/{pid}/integrations/{name}/test")
async def test_integ(pid: str, name: str, user=Depends(current_user)):
    p = await get_project(pid)
    cfg = (p.get("integrations") or {}).get(name)
    if not cfg:
        raise HTTPException(400, "Integración no configurada")
    try:
        return await test_integration(name, cfg)
    except Exception as e:
        return {"ok": False, "detail": str(e)[:200]}


# ---------- Stats & leads ----------
@router.get("/projects/{pid}/stats")
async def stats(pid: str, days: int = 30, user=Depends(current_user)):
    since = (now() - timedelta(days=days)).isoformat()
    events = [e async for e in db.events.find({"project_id": pid, "created_at": {"$gte": since}})]
    arts = {a["_id"]: a async for a in db.articles.find({"project_id": pid}, {"title": 1, "slug": 1, "status": 1})}
    per, daily = {}, {}
    for e in events:
        d = e["created_at"][:10]
        daily.setdefault(d, {"date": d, "view": 0, "product_click": 0, "cta_click": 0, "lead": 0, "list_view": 0})
        daily[d][e["type"]] = daily[d].get(e["type"], 0) + 1
        if e.get("article_id"):
            r = per.setdefault(e["article_id"], {"view": 0, "product_click": 0, "cta_click": 0, "lead": 0})
            r[e["type"]] = r.get(e["type"], 0) + 1
    rows = []
    for aid, r in per.items():
        clicks = r["product_click"] + r["cta_click"]
        rows.append({"article_id": aid, "title": arts.get(aid, {}).get("title", "(borrado)"), **r, "clicks": clicks,
                     "ctr": round(clicks / r["view"] * 100, 1) if r["view"] else 0})
    rows.sort(key=lambda x: -x["view"])
    series = []
    for i in range(days, -1, -1):
        d = (now() - timedelta(days=i)).strftime("%Y-%m-%d")
        series.append(daily.get(d, {"date": d, "view": 0, "product_click": 0, "cta_click": 0, "lead": 0, "list_view": 0}))
    tot = lambda t: sum(1 for e in events if e["type"] == t)
    views, clicks = tot("view"), tot("product_click") + tot("cta_click")
    return {"totals": {"views": views, "list_views": tot("list_view"), "clicks": clicks, "leads": tot("lead"),
                       "ctr": round(clicks / views * 100, 1) if views else 0}, "series": series, "articles": rows}


@router.get("/projects/{pid}/leads")
async def list_leads(pid: str, user=Depends(current_user)):
    return [clean(l) async for l in db.leads.find({"project_id": pid}).sort("created_at", -1)]


@router.patch("/leads/{lid}")
async def update_lead(lid: str, body: dict, user=Depends(current_user)):
    await db.leads.update_one({"_id": lid}, {"$set": {k: v for k, v in body.items() if k in ("status", "notes")}})
    return clean(await db.leads.find_one({"_id": lid}))


# ---------- AI visibility ----------
@router.get("/projects/{pid}/prompts")
async def list_prompts(pid: str, user=Depends(current_user)):
    return [clean(x) async for x in db.prompts.find({"project_id": pid})]


@router.post("/projects/{pid}/prompts")
async def add_prompt(pid: str, body: dict, user=Depends(current_user)):
    if not body.get("text"):
        raise HTTPException(400, "Escribe la pregunta")
    doc = {"_id": new_id(), "project_id": pid, "text": body["text"].strip(), "frequency": body.get("frequency", "weekly"),
           "last_run": None, "created_at": iso()}
    await db.prompts.insert_one(doc)
    return clean(doc)


@router.delete("/prompts/{qid}")
async def del_prompt(qid: str, user=Depends(current_user)):
    await db.prompts.delete_one({"_id": qid})
    await db.visibility.delete_many({"prompt_id": qid})
    return {"ok": True}


def analyze_answer(text, brand, competitors):
    low = text.lower()
    mentioned = bool(brand) and brand.lower() in low
    position = None
    items = [l for l in text.split("\n") if re.match(r"^\s*(\d+[.)]|[-*•]|#{2,4})\s+", l)]
    for i, l in enumerate(items):
        if brand and brand.lower() in l.lower():
            position = i + 1
            break
    if mentioned and position is None:
        position = 1 if low.find(brand.lower()) < len(low) * 0.25 else None
    found = [c for c in competitors if c and c.lower().split(".")[0] in low]
    return mentioned, position, found


async def run_prompt(prompt, project):
    brand = (project.get("brand") or {}).get("brand_name") or project["name"]
    comps = project.get("competitors") or []
    results = []
    for prov in ("openai", "anthropic", "gemini", "perplexity"):
        if not await get_key(prov):
            continue
        try:
            ans = await complete(prompt["text"], "Responde como lo harías a un usuario normal, recomendando opciones concretas por su nombre.",
                                 prov, project["id"], None, "visibilidad_ia")
            m, pos, found = analyze_answer(ans, brand, comps)
            r = {"provider": prov, "mentioned": m, "position": pos, "competitors": found, "answer": ans[:3000], "error": None}
        except HTTPException as e:
            r = {"provider": prov, "mentioned": False, "position": None, "competitors": [], "answer": "", "error": e.detail}
        r.update({"_id": new_id(), "project_id": project["id"], "prompt_id": prompt["id"], "prompt": prompt["text"], "created_at": iso()})
        results.append(r)
    if results:
        await db.visibility.insert_many(results)
    await db.prompts.update_one({"_id": prompt["id"]}, {"$set": {"last_run": iso()}})
    return [clean(r) for r in results]


@router.post("/projects/{pid}/visibility/run")
async def run_visibility(pid: str, body: dict = None, user=Depends(current_user)):
    p = await get_project(pid)
    q = {"project_id": pid}
    if body and body.get("prompt_id"):
        q["_id"] = body["prompt_id"]
    prompts = [clean(x) async for x in db.prompts.find(q)]
    if not prompts:
        raise HTTPException(400, "Añade primero alguna pregunta a seguir")
    out = []
    for pr in prompts:
        out += await run_prompt(pr, p)
    return {"results": out}


@router.get("/projects/{pid}/visibility")
async def visibility(pid: str, user=Depends(current_user)):
    rows = [clean(r) async for r in db.visibility.find({"project_id": pid}).sort("created_at", -1).limit(500)]
    by_prov, timeline, comps = {}, {}, {}
    for r in rows:
        if r.get("error"):
            continue
        s = by_prov.setdefault(r["provider"], {"provider": r["provider"], "label": LABELS.get(r["provider"]), "runs": 0, "mentions": 0, "positions": []})
        s["runs"] += 1
        s["mentions"] += int(r["mentioned"])
        if r.get("position"):
            s["positions"].append(r["position"])
        d = r["created_at"][:10]
        t = timeline.setdefault(d, {"date": d, "runs": 0, "mentions": 0})
        t["runs"] += 1
        t["mentions"] += int(r["mentioned"])
        for c in r.get("competitors") or []:
            comps[c] = comps.get(c, 0) + 1
    summary = [{**s, "rate": round(s["mentions"] / s["runs"] * 100), "avg_position": round(sum(s["positions"]) / len(s["positions"]), 1) if s["positions"] else None}
               for s in by_prov.values()]
    for s in summary:
        s.pop("positions")
    tl = sorted(({**t, "rate": round(t["mentions"] / t["runs"] * 100)} for t in timeline.values()), key=lambda x: x["date"])
    return {"summary": summary, "timeline": tl, "competitors": sorted(({"name": k, "count": v} for k, v in comps.items()), key=lambda x: -x["count"]),
            "latest": rows[:40]}


# ---------- Technical audit ----------
@router.post("/projects/{pid}/audit")
async def audit(pid: str, user=Depends(current_user)):
    p = await get_project(pid)
    url = p["url"]
    issues = []
    add = lambda prio, area, msg, fix: issues.append({"priority": prio, "area": area, "issue": msg, "fix": fix})
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers=UA) as c:
        t0 = time.time()
        try:
            r = await c.get(url)
        except Exception as e:
            raise HTTPException(400, f"No se pudo acceder a la web: {e}")
        ttfb = int((time.time() - t0) * 1000)
        soup = BeautifulSoup(r.text, "html.parser")
        title = (soup.title.string or "").strip() if soup.title else ""
        desc = (soup.find("meta", attrs={"name": "description"}) or {}).get("content", "") if soup.find("meta", attrs={"name": "description"}) else ""
        h1s = soup.find_all("h1")
        canonical = soup.find("link", rel="canonical")
        jsonlds = soup.find_all("script", type="application/ld+json")
        og = soup.find("meta", property="og:title")
        viewport = soup.find("meta", attrs={"name": "viewport"})
        imgs = soup.find_all("img")
        no_alt = [i for i in imgs if not i.get("alt")]
        lang = (soup.html or {}).get("lang") if soup.html else None
        if not title: add("alta", "Metadatos", "La página no tiene etiqueta <title>.", "Añade un título único de 50-60 caracteres con tu palabra clave.")
        elif not 30 <= len(title) <= 65: add("media", "Metadatos", f"El título mide {len(title)} caracteres.", "Ajústalo a 30-60 caracteres.")
        if not desc: add("alta", "Metadatos", "Falta la meta descripción.", "Escribe una descripción persuasiva de 140-155 caracteres.")
        elif not 70 <= len(desc) <= 170: add("baja", "Metadatos", f"La meta descripción mide {len(desc)} caracteres.", "Ajústala a 140-155 caracteres.")
        if len(h1s) != 1: add("media", "Títulos", f"Hay {len(h1s)} etiquetas H1.", "Usa exactamente un H1 por página.")
        if not canonical: add("media", "Indexación", "No hay etiqueta canonical.", "Añade <link rel='canonical'> con la URL principal.")
        if not jsonlds: add("alta", "Datos estructurados", "No hay datos estructurados (JSON-LD).", "Añade Organization/LocalBusiness y Product. Ayuda a Google y a las IAs a entender tu marca.")
        if not og: add("baja", "Redes", "Faltan etiquetas Open Graph.", "Añade og:title, og:description y og:image.")
        if not viewport: add("alta", "Móvil", "Falta la etiqueta viewport.", "Añade <meta name='viewport' content='width=device-width, initial-scale=1'>.")
        if not lang: add("baja", "Idioma", "La etiqueta <html> no declara idioma.", "Añade lang='es' (o el idioma del sitio).")
        if no_alt: add("media", "Accesibilidad", f"{len(no_alt)} de {len(imgs)} imágenes no tienen texto alternativo.", "Añade atributos alt descriptivos.")
        if ttfb > 1500: add("alta", "Velocidad", f"La página tarda {ttfb} ms en responder.", "Revisa hosting, caché y peso de la página.")
        elif ttfb > 800: add("media", "Velocidad", f"Respuesta algo lenta ({ttfb} ms).", "Activa caché y compresión.")
        size_kb = len(r.content) // 1024
        if size_kb > 500: add("media", "Velocidad", f"El HTML pesa {size_kb} KB.", "Reduce scripts y HTML inline.")
        base = f"{urlparse(str(r.url)).scheme}://{urlparse(str(r.url)).netloc}"
        robots = await c.get(base + "/robots.txt")
        robots_ok = robots.status_code == 200
        if not robots_ok: add("media", "Rastreo", "No existe robots.txt.", "Crea un robots.txt que permita rastrear y enlace a tu sitemap.")
        else:
            txt = robots.text.lower()
            if "disallow: /\n" in txt + "\n" and "user-agent: *" in txt: add("alta", "Rastreo", "robots.txt bloquea todo el sitio.", "Elimina 'Disallow: /' para el agente '*'.")
            for bot in ("gptbot", "claudebot", "perplexitybot", "google-extended"):
                if bot in txt and "disallow" in txt.split(bot, 1)[1][:80]:
                    add("media", "Visibilidad IA", f"robots.txt bloquea a {bot}.", f"Si quieres aparecer en respuestas de IA, permite {bot}.")
        sm = await c.get(base + "/sitemap.xml")
        if sm.status_code != 200: add("media", "Rastreo", "No se encontró /sitemap.xml.", "Genera un sitemap y envíalo a Google Search Console.")
        llm_txt = await c.get(base + "/llms.txt")
        if llm_txt.status_code != 200: add("baja", "Visibilidad IA", "No hay archivo llms.txt.", "Usa el llms.txt que genera esta herramienta (pestaña Publicar).")
        host = urlparse(str(r.url)).netloc
        links = list({urljoin(str(r.url), a["href"]).split("#")[0] for a in soup.find_all("a", href=True)
                      if a["href"].startswith(("/", "http")) and urlparse(urljoin(str(r.url), a["href"])).netloc == host})[:25]

        async def chk(u):
            try:
                x = await c.head(u)
                if x.status_code >= 400:
                    x = await c.get(u)
                return u, x.status_code
            except Exception:
                return u, 0
        res = await asyncio.gather(*(chk(u) for u in links))
        broken = [{"url": u, "status": s} for u, s in res if s >= 400 or s == 0]
        for b in broken:
            add("alta", "Enlaces rotos", f"Enlace roto ({b['status'] or 'sin respuesta'}): {b['url']}", "Corrige o elimina el enlace, o crea una redirección 301.")
    order = {"alta": 0, "media": 1, "baja": 2}
    issues.sort(key=lambda x: order[x["priority"]])
    score = max(0, 100 - sum({"alta": 12, "media": 6, "baja": 2}[i["priority"]] for i in issues))
    result = {"url": url, "score": score, "ttfb_ms": ttfb, "size_kb": size_kb, "title": title, "description": desc,
              "checked_links": len(links), "broken_links": broken, "jsonld_count": len(jsonlds), "robots": robots_ok,
              "issues": issues, "created_at": iso()}
    await db.projects.update_one({"_id": pid}, {"$set": {"last_audit": result}})
    return result


# ---------- Costs ----------
@router.get("/costs")
async def costs(project_id: str = "", user=Depends(current_user)):
    month = now().strftime("%Y-%m")
    match = {"month": month, **({"project_id": project_id} if project_id else {})}
    by = lambda field: [{"key": d["_id"], "cost": round(d["cost"], 4), "calls": d["n"]} for d in []]
    async def group(field):
        rows = await db.usage.aggregate([{"$match": match}, {"$group": {"_id": f"${field}", "cost": {"$sum": "$cost"}, "n": {"$sum": 1},
                                                                         "tokens": {"$sum": {"$add": ["$input_tokens", "$output_tokens"]}}}},
                                          {"$sort": {"cost": -1}}]).to_list(200)
        return [{"key": r["_id"], "cost": round(r["cost"], 4), "calls": r["n"], "tokens": r["tokens"]} for r in rows]
    by_project = await group("project_id")
    names = {p["_id"]: p["name"] async for p in db.projects.find({}, {"name": 1, "monthly_budget": 1})}
    budgets = {p["_id"]: p.get("monthly_budget", 0) async for p in db.projects.find({}, {"monthly_budget": 1})}
    for r in by_project:
        r["name"] = names.get(r["key"], "Ajustes / pruebas")
        r["budget"] = budgets.get(r["key"], 0)
    by_article = await group("article_id")
    titles = {a["_id"]: a["title"] async for a in db.articles.find({"_id": {"$in": [r["key"] for r in by_article if r["key"]]}}, {"title": 1})}
    for r in by_article:
        r["name"] = titles.get(r["key"], "—")
    by_article = [r for r in by_article if r["key"]][:30]
    return {"month": month, "total": round(sum(r["cost"] for r in by_project), 4), "by_project": by_project,
            "by_article": by_article, "by_purpose": await group("purpose"), "by_provider": await group("provider")}
