import os
import re
import time
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core import (db, clean, new_id, iso, now, token, encrypt, decrypt, mask, hash_password, verify_password,
                  create_token, current_user, get_key, get_project, base_url)
from llm import complete_json, complete, pick_provider, MODELS, LABELS
from content import build_system

router = APIRouter(prefix="/api")
UA = {"User-Agent": "Mozilla/5.0 (compatible; MotorSEO/1.0)"}


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
async def login(body: LoginIn, request: Request):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else 'x'}:{email}"
    att = await db.login_attempts.find_one({"_id": ident})
    if att and att.get("count", 0) >= 5 and time.time() - att.get("ts", 0) < 900:
        raise HTTPException(429, "Demasiados intentos. Espera 15 minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"_id": ident}, {"$inc": {"count": 1}, "$set": {"ts": time.time()}}, upsert=True)
        raise HTTPException(401, "Email o contraseña incorrectos")
    await db.login_attempts.delete_one({"_id": ident})
    u = clean(user)
    u.pop("password_hash", None)
    return {"token": create_token(u["id"], u["email"]), "user": u}


@router.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


async def seed_admin():
    email, pwd = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    ex = await db.users.find_one({"email": email})
    if not ex:
        await db.users.insert_one({"_id": new_id(), "email": email, "password_hash": hash_password(pwd),
                                   "name": "Administrador", "role": "admin", "created_at": iso()})
    elif not verify_password(pwd, ex["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd)}})
    await db.users.create_index("email", unique=True)
    await db.articles.create_index([("project_id", 1), ("slug", 1)])
    await db.events.create_index([("project_id", 1), ("created_at", 1)])
    await db.usage.create_index([("project_id", 1), ("month", 1)])


# ---------- API keys ----------
KEY_DEFS = {
    "anthropic": {"label": "Anthropic (Claude)", "help": "console.anthropic.com → API Keys → Create Key", "group": "ia"},
    "openai": {"label": "OpenAI (GPT, imágenes, voz)", "help": "platform.openai.com → API keys → Create new secret key", "group": "ia"},
    "gemini": {"label": "Google Gemini", "help": "aistudio.google.com → Get API key", "group": "ia"},
    "perplexity": {"label": "Perplexity (búsqueda en vivo)", "help": "perplexity.ai → Settings → API → Generate", "group": "ia"},
    "resend": {"label": "Resend (avisos por email)", "help": "resend.com → API Keys. Verifica tu dominio en Domains (registros DNS).", "group": "email",
               "extra": ["from_email"]},
}


class KeyIn(BaseModel):
    value: str
    extra: dict = {}


@router.get("/keys")
async def list_keys(user=Depends(current_user)):
    docs = {d["_id"]: d async for d in db.api_keys.find()}
    out = []
    for k, meta in KEY_DEFS.items():
        d = docs.get(k)
        out.append({"name": k, **meta, "configured": bool(d), "masked": mask(decrypt(d["value"])) if d else "",
                    "extra_values": (d or {}).get("extra", {}), "last_test": (d or {}).get("last_test"),
                    "model": MODELS.get(k)})
    return out


@router.put("/keys/{name}")
async def set_key(name: str, body: KeyIn, user=Depends(current_user)):
    if name not in KEY_DEFS:
        raise HTTPException(404, "Clave desconocida")
    upd = {"extra": body.extra, "updated_at": iso()}
    if body.value.strip():
        upd["value"] = encrypt(body.value.strip())
    elif not await db.api_keys.find_one({"_id": name}):
        raise HTTPException(400, "Introduce la clave")
    await db.api_keys.update_one({"_id": name}, {"$set": upd, "$unset": {"last_test": ""}}, upsert=True)
    return {"ok": True}


@router.delete("/keys/{name}")
async def del_key(name: str, user=Depends(current_user)):
    await db.api_keys.delete_one({"_id": name})
    return {"ok": True}


@router.post("/keys/{name}/test")
async def test_key(name: str, user=Depends(current_user)):
    key = await get_key(name)
    if not key:
        raise HTTPException(400, "Clave no configurada")
    t0 = time.time()
    try:
        if name == "resend":
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get("https://api.resend.com/domains", headers={"Authorization": f"Bearer {key}"})
            if r.status_code >= 400:
                raise Exception(r.text[:200])
        else:
            await complete("Responde solo: OK", "Eres un test de conexión.", name, purpose="test")
        res = {"ok": True, "latency_ms": int((time.time() - t0) * 1000), "at": iso()}
    except HTTPException as e:
        res = {"ok": False, "error": e.detail, "at": iso()}
    except Exception as e:
        res = {"ok": False, "error": str(e)[:300], "at": iso()}
    await db.api_keys.update_one({"_id": name}, {"$set": {"last_test": res}})
    return res


# ---------- Projects ----------
class ProjectIn(BaseModel):
    name: str
    url: str
    niche: str = ""
    country: str = "España"
    language: str = "español"
    lang_code: str = "es"
    audience: str = ""
    competitors: list = []
    llm_provider: str = "anthropic"


@router.get("/projects")
async def list_projects(user=Depends(current_user)):
    out = []
    async for p in db.projects.find({}, {"integrations": 0}).sort("created_at", -1):
        p = clean(p)
        p["article_count"] = await db.articles.count_documents({"project_id": p["id"]})
        p["published_count"] = await db.articles.count_documents({"project_id": p["id"], "status": "published"})
        out.append(p)
    return out


@router.post("/projects")
async def create_project(body: ProjectIn, request: Request, user=Depends(current_user)):
    doc = body.model_dump()
    url = doc["url"].strip()
    doc["url"] = url if url.startswith("http") else "https://" + url
    doc.update({"_id": new_id(), "public_key": token(), "brand": {}, "catalog": [], "cta": {},
                "cadence": {"per_week": 3, "days": [1, 3, 5], "hour": 9}, "autopilot": {"enabled": False, "auto_publish": False},
                "widget": {"color": "#10B981", "layout": "grid", "lead_form": True}, "monthly_budget": 0, "notify_email": "",
                "base_url": base_url(request), "created_at": iso()})
    await db.projects.insert_one(doc)
    return await get_project(doc["_id"])


@router.get("/projects/{pid}")
async def project_detail(pid: str, user=Depends(current_user)):
    p = await get_project(pid)
    integ = p.pop("integrations", {}) or {}
    p["integrations"] = {k: {kk: (mask(decrypt(vv)) if kk.endswith("_enc") else vv) for kk, vv in v.items()} for k, v in integ.items()}
    return p


@router.patch("/projects/{pid}")
async def update_project(pid: str, body: dict, request: Request, user=Depends(current_user)):
    allowed = {"name", "url", "niche", "country", "language", "lang_code", "audience", "competitors", "llm_provider",
               "brand", "catalog", "cta", "cadence", "autopilot", "widget", "monthly_budget", "notify_email", "blog_url_pattern",
               "custom_domain"}
    upd = {k: v for k, v in body.items() if k in allowed}
    upd["base_url"] = base_url(request)
    await db.projects.update_one({"_id": pid}, {"$set": upd})
    return await project_detail(pid)


@router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(current_user)):
    for col in ("articles", "topics", "authors", "events", "leads", "prompts", "visibility", "usage"):
        await db[col].delete_many({"project_id": pid})
    await db.projects.delete_one({"_id": pid})
    return {"ok": True}


async def fetch_page(url):
    async with httpx.AsyncClient(timeout=25, follow_redirects=True, headers=UA) as c:
        r = await c.get(url)
    return r


@router.post("/projects/{pid}/analyze")
async def analyze_brand(pid: str, user=Depends(current_user)):
    p = await get_project(pid)
    try:
        r = await fetch_page(p["url"])
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer la web: {e}")
    soup = BeautifulSoup(r.text, "html.parser")
    host = urlparse(p["url"]).netloc
    links = []
    for a in soup.find_all("a", href=True):
        u = urljoin(p["url"], a["href"]).split("#")[0]
        t = a.get_text(" ", strip=True)
        if urlparse(u).netloc == host and t and len(t) < 80 and u not in [l["url"] for l in links]:
            links.append({"title": t, "url": u})
    for s in soup(["script", "style", "noscript"]):
        s.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(" "))[:7000]
    title = soup.title.string if soup.title else ""
    prompt = f"""Analiza esta web y extrae el perfil de marca.
URL: {p['url']}
Título: {title}
Texto: {text}
Enlaces internos: {links[:60]}
Devuelve JSON: {{"brand_name": "", "offer": "qué vende en 1-2 frases", "tone": "tono de voz", "audience": "público objetivo",
"value_props": ["..."], "pages_to_link": [{{"title": "", "url": ""}}] (máx 15, las más útiles para enlazar desde un blog),
"products": [{{"name": "", "url": "", "price": "", "benefit": ""}}] (máx 8; precio vacío si no aparece),
"niche": "nicho en pocas palabras", "competitors_guess": ["dominios o marcas competidoras probables"]}}"""
    provider = await pick_provider(p.get("llm_provider"))
    data = await complete_json(prompt, "Eres un analista de marketing y SEO.", provider, project_id=pid, purpose="analisis_marca")
    upd = {"brand": {k: data.get(k) for k in ("brand_name", "offer", "tone", "audience", "value_props", "pages_to_link")}}
    if not p.get("catalog"):
        upd["catalog"] = data.get("products") or []
    if not p.get("niche"):
        upd["niche"] = data.get("niche", "")
    if not p.get("competitors"):
        upd["competitors"] = data.get("competitors_guess") or []
    await db.projects.update_one({"_id": pid}, {"$set": upd})
    return await project_detail(pid)


# ---------- Authors ----------
@router.get("/projects/{pid}/authors")
async def list_authors(pid: str, user=Depends(current_user)):
    return [clean(a) async for a in db.authors.find({"project_id": pid})]


@router.post("/projects/{pid}/authors")
async def save_author(pid: str, body: dict, user=Depends(current_user)):
    data = {k: body.get(k, "") for k in ("name", "photo_url", "bio", "credentials", "same_as")}
    if not data["name"]:
        raise HTTPException(400, "El nombre es obligatorio")
    aid = body.get("id") or new_id()
    await db.authors.update_one({"_id": aid}, {"$set": {**data, "project_id": pid}}, upsert=True)
    return clean(await db.authors.find_one({"_id": aid}))


@router.delete("/authors/{aid}")
async def delete_author(aid: str, user=Depends(current_user)):
    await db.authors.delete_one({"_id": aid})
    return {"ok": True}


# ---------- Plan & topics ----------
@router.get("/projects/{pid}/topics")
async def list_topics(pid: str, user=Depends(current_user)):
    return [clean(t) async for t in db.topics.find({"project_id": pid}).sort([("day", 1), ("created_at", 1)])]


async def _save_topics(pid, items, source):
    docs = []
    for i, t in enumerate(items):
        docs.append({"_id": new_id(), "project_id": pid, "title": t.get("title", ""), "keyword": t.get("keyword", ""),
                     "intent": t.get("intent", "media"), "cluster": t.get("cluster", "General"), "is_pillar": bool(t.get("is_pillar")),
                     "product": t.get("product", ""), "type": t.get("type", "guia"), "day": t.get("day", i + 1),
                     "reason": t.get("reason", ""), "status": "propuesto", "source": source, "created_at": iso()})
    if docs:
        await db.topics.insert_many(docs)
    return [clean(d) for d in docs]


@router.post("/projects/{pid}/plan")
async def generate_plan(pid: str, user=Depends(current_user)):
    p = await get_project(pid)
    existing = [t["title"] async for t in db.topics.find({"project_id": pid}, {"title": 1})]
    cat = [c.get("name") for c in p.get("catalog") or []]
    prompt = f"""Crea un plan de contenidos de 30 días para el blog de esta marca, priorizado por INTENCIÓN DE COMPRA.
Marca: {(p.get('brand') or {}).get('brand_name') or p['name']} — {(p.get('brand') or {}).get('offer', '')}
Nicho: {p.get('niche')}. País: {p.get('country')}. Idioma: {p.get('language')}. Público: {p.get('audience') or (p.get('brand') or {}).get('audience', '')}
Productos: {cat}
Competidores: {p.get('competitors')}
Evita repetir estos temas: {existing[:50]}
Organiza los temas en 3-5 clusters, cada uno con 1 página pilar (is_pillar=true) y artículos satélite.
Ordena: primero alta intención (comparativas, "mejor X para Y", precios, alternativas), luego media, luego informacional.
Devuelve un array JSON de 30 objetos: {{"day": 1-30, "title": "", "keyword": "palabra clave principal realista", "intent": "alta|media|informacional",
"cluster": "nombre del cluster", "is_pillar": false, "product": "producto del catálogo que empuja", "type": "guia|lista|comparativa|alternativas|tutorial",
"reason": "por qué este tema vende, en 1 frase"}}"""
    provider = await pick_provider(p.get("llm_provider"))
    items = await complete_json(prompt, build_system(p), provider, project_id=pid, purpose="plan")
    if isinstance(items, dict):
        items = items.get("topics") or items.get("plan") or []
    return await _save_topics(pid, items[:30], "plan")


@router.post("/projects/{pid}/comparisons")
async def generate_comparisons(pid: str, user=Depends(current_user)):
    p = await get_project(pid)
    brand = (p.get("brand") or {}).get("brand_name") or p["name"]
    prompt = f"""Genera 8 temas de páginas de comparación de máxima intención de compra para {brand} ({(p.get('brand') or {}).get('offer', '')}).
Competidores: {p.get('competitors')}. Productos: {[c.get('name') for c in p.get('catalog') or []]}.
Mezcla: "{brand} vs [competidor]", "[competidor A] vs [competidor B]" y "mejores alternativas a [competidor]".
Array JSON: {{"title": "", "keyword": "", "intent": "alta", "cluster": "Comparativas", "is_pillar": false, "product": "", "type": "comparativa|alternativas", "reason": ""}}"""
    provider = await pick_provider(p.get("llm_provider"))
    items = await complete_json(prompt, build_system(p), provider, project_id=pid, purpose="comparativas")
    return await _save_topics(pid, items if isinstance(items, list) else items.get("topics", []), "comparativas")


@router.post("/projects/{pid}/topics")
async def add_topic(pid: str, body: dict, user=Depends(current_user)):
    return (await _save_topics(pid, [body], "manual"))[0]


@router.patch("/topics/{tid}")
async def update_topic(tid: str, body: dict, user=Depends(current_user)):
    allowed = {"title", "keyword", "intent", "cluster", "is_pillar", "product", "type", "status", "day"}
    await db.topics.update_one({"_id": tid}, {"$set": {k: v for k, v in body.items() if k in allowed}})
    return clean(await db.topics.find_one({"_id": tid}))


@router.delete("/topics/{tid}")
async def delete_topic(tid: str, user=Depends(current_user)):
    await db.topics.delete_one({"_id": tid})
    return {"ok": True}


@router.get("/projects/{pid}/clusters")
async def clusters(pid: str, user=Depends(current_user)):
    topics = [clean(t) async for t in db.topics.find({"project_id": pid})]
    arts = {a["topic_id"]: a async for a in db.articles.find({"project_id": pid}, {"topic_id": 1, "status": 1, "title": 1})}
    groups = {}
    for t in topics:
        a = arts.get(t["id"])
        node = {"id": t["id"], "title": t["title"], "is_pillar": t["is_pillar"], "intent": t["intent"],
                "article_status": a["status"] if a else None, "article_id": a["_id"] if a else None}
        groups.setdefault(t["cluster"] or "General", []).append(node)
    out = []
    for name, nodes in groups.items():
        pillar = next((n for n in nodes if n["is_pillar"]), None)
        out.append({"name": name, "pillar": pillar, "satellites": [n for n in nodes if n is not pillar],
                    "gaps": sum(1 for n in nodes if not n["article_status"]),
                    "missing_pillar": pillar is None})
    return out
