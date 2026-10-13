import asyncio
import base64
import json
import os
import re

import openai
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core import db, clean, new_id, iso, slugify, current_user, get_project, get_article, get_key, fs
from llm import stream, complete, complete_json, pick_provider
from content import (build_system, build_article_prompt, meta_prompt, extract_faq, extract_key_points, score_article,
                     numeric_claims, render_html)
from publisher import publish_article, article_url

router = APIRouter(prefix="/api")


@router.post("/topics/{tid}/interview")
async def interview_questions(tid: str, user=Depends(current_user)):
    t = clean(await db.topics.find_one({"_id": tid}))
    if not t:
        raise HTTPException(404, "Tema no encontrado")
    p = await get_project(t["project_id"])
    prompt = (f"Vas a entrevistar al experto de la marca antes de escribir el artículo '{t['title']}'. "
              "Genera 4 preguntas cortas y concretas para sacar experiencia real: errores comunes que ve en clientes, un caso real con resultado, "
              "un consejo que pocos dan, y una opinión propia. Array JSON de strings.")
    qs = await complete_json(prompt, build_system(p), await pick_provider(p.get("llm_provider")), project_id=p["id"], purpose="entrevista")
    return {"questions": qs if isinstance(qs, list) else qs.get("questions", [])}


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user=Depends(current_user)):
    key = await get_key("openai")
    if not key:
        raise HTTPException(400, "Para notas de voz necesitas la clave de OpenAI en Ajustes.")
    data = await file.read()
    client = openai.AsyncOpenAI(api_key=key)
    try:
        r = await client.audio.transcriptions.create(model="whisper-1", file=(file.filename or "nota.webm", data), language="es")
    except Exception as e:
        raise HTTPException(502, f"Error al transcribir: {str(e)[:200]}")
    return {"text": r.text}


class GenIn(BaseModel):
    topic_id: str
    interview: list = []
    author_id: str = ""
    words: int = 1800


def sse(obj):
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


async def finalize(project, topic, article_id, content, provider):
    meta = await complete_json(meta_prompt(project, topic, content), "Eres un experto SEO.", provider,
                               project_id=project["id"], article_id=article_id, purpose="metadatos")
    slug = slugify(meta.get("slug") or topic["title"])
    if await db.articles.find_one({"project_id": project["id"], "slug": slug, "_id": {"$ne": article_id}}):
        slug = f"{slug}-{article_id[:4]}"
    upd = {"content": content, "meta_title": meta.get("meta_title", topic["title"])[:70],
           "meta_description": meta.get("meta_description", "")[:170], "slug": slug, "excerpt": meta.get("excerpt", ""),
           "sensitive": meta.get("sensitive") or {}, "faq": extract_faq(content), "key_points": extract_key_points(content),
           "updated_at": iso()}
    art = {**(await get_article(article_id)), **upd}
    upd["score"] = score_article(project, art)
    await db.articles.update_one({"_id": article_id}, {"$set": upd})
    await db.topics.update_one({"_id": topic["id"]}, {"$set": {"status": "escrito"}})
    return await get_article(article_id)


async def generate_events(body: GenIn, status="draft"):
    topic = clean(await db.topics.find_one({"_id": body.topic_id}))
    if not topic:
        raise HTTPException(404, "Tema no encontrado")
    project = await get_project(topic["project_id"])
    provider = await pick_provider(project.get("llm_provider"))
    author = await db.authors.find_one({"_id": body.author_id}) if body.author_id else None
    aid = new_id()
    await db.articles.insert_one({"_id": aid, "project_id": project["id"], "topic_id": topic["id"], "title": topic["title"],
                                  "keyword": topic.get("keyword"), "intent": topic.get("intent"), "type": topic.get("type"),
                                  "cluster": topic.get("cluster"), "status": "generating", "content": "", "slug": slugify(topic["title"]),
                                  "interview": body.interview, "author_id": body.author_id or None, "provider": provider,
                                  "created_at": iso()})
    yield {"t": "start", "article_id": aid, "provider": provider}
    yield {"t": "status", "c": "Escribiendo el artículo"}
    parts = []
    try:
        async for chunk in stream(build_article_prompt(project, topic, body.interview, clean(author), body.words),
                                  build_system(project), provider, project["id"], aid, "redaccion"):
            parts.append(chunk)
            yield {"t": "delta", "c": chunk}
        yield {"t": "status", "c": "Optimizando metadatos, FAQ y datos estructurados"}
        await db.articles.update_one({"_id": aid}, {"$set": {"status": status}})
        art = await finalize(project, topic, aid, "".join(parts), provider)
        if await has_image_key():
            yield {"t": "status", "c": "Creando la portada con IA"}
            await cover_safe(aid)
            art = await get_article(aid)
        yield {"t": "done", "article": art}
    except HTTPException as e:
        await db.articles.update_one({"_id": aid}, {"$set": {"status": "draft", "content": "".join(parts)}})
        yield {"t": "error", "c": e.detail}


@router.post("/articles/generate")
async def generate(body: GenIn, user=Depends(current_user)):
    async def gen():
        try:
            async for ev in generate_events(body):
                yield sse(ev)
        except HTTPException as e:
            yield sse({"t": "error", "c": e.detail})
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/projects/{pid}/articles")
async def list_articles(pid: str, user=Depends(current_user)):
    return [clean(a) async for a in db.articles.find({"project_id": pid}, {"content": 0}).sort("created_at", -1)]


@router.get("/articles/{aid}")
async def article_detail(aid: str, user=Depends(current_user)):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    a["html"] = render_html(p, a)
    a["url"] = article_url(p, a)
    return a


@router.patch("/articles/{aid}")
async def update_article(aid: str, body: dict, user=Depends(current_user)):
    allowed = {"title", "content", "meta_title", "meta_description", "slug", "author_id", "keyword", "facts_approved", "excerpt",
               "title_b", "sensitive"}
    upd = {k: v for k, v in body.items() if k in allowed}
    if "slug" in upd:
        upd["slug"] = slugify(upd["slug"])
    upd["updated_at"] = iso()
    await db.articles.update_one({"_id": aid}, {"$set": upd})
    a = await get_article(aid)
    if "content" in upd:
        p = await get_project(a["project_id"])
        extra = {"faq": extract_faq(a["content"]), "key_points": extract_key_points(a["content"])}
        extra["score"] = score_article(p, {**a, **extra})
        await db.articles.update_one({"_id": aid}, {"$set": extra})
    return await article_detail(aid)


@router.delete("/articles/{aid}")
async def delete_article(aid: str, user=Depends(current_user)):
    a = await get_article(aid)
    await db.articles.delete_one({"_id": aid})
    if a.get("topic_id"):
        await db.topics.update_one({"_id": a["topic_id"]}, {"$set": {"status": "aprobado"}})
    return {"ok": True}


@router.post("/articles/{aid}/score")
async def rescore(aid: str, user=Depends(current_user)):
    a = await get_article(aid)
    s = score_article(await get_project(a["project_id"]), a)
    await db.articles.update_one({"_id": aid}, {"$set": {"score": s}})
    return s


@router.post("/articles/{aid}/factcheck")
async def factcheck(aid: str, user=Depends(current_user)):
    return await factcheck_internal(aid)


async def factcheck_internal(aid):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    claims = numeric_claims(a["content"])
    if not claims:
        await db.articles.update_one({"_id": aid}, {"$set": {"factcheck": [], "factcheck_at": iso()}})
        return {"claims": [], "provider": None}
    provider = "perplexity" if await get_key("perplexity") else await pick_provider(p.get("llm_provider"))
    prompt = f"""Verifica cada afirmación con cifras de este artículo. Para cada una indica:
- "con_fuente": hay un enlace a una fuente real y fiable que respalda la cifra (o tú conoces y citas una fuente real verificable),
- "sin_fuente": la cifra puede ser cierta pero no tiene fuente,
- "dudosa": la cifra parece inventada, desactualizada o incorrecta.
Afirmaciones: {claims}
Texto completo (para ver enlaces): {a['content'][:8000]}
Array JSON: [{{"claim": "", "status": "con_fuente|sin_fuente|dudosa", "source_url": "url real o vacío", "note": "explicación breve"}}]"""
    res = await complete_json(prompt, "Eres un verificador de datos riguroso. No inventes URLs.", provider,
                              project_id=p["id"], article_id=aid, purpose="verificacion")
    res = res if isinstance(res, list) else res.get("claims", [])
    await db.articles.update_one({"_id": aid}, {"$set": {"factcheck": res, "factcheck_at": iso(), "facts_approved": False}})
    return {"claims": res, "provider": provider}


class SectionIn(BaseModel):
    heading: str
    instructions: str = ""


@router.post("/articles/{aid}/regenerate-section")
async def regenerate_section(aid: str, body: SectionIn, user=Depends(current_user)):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    pattern = re.compile(rf"(^## {re.escape(body.heading)}\s*$.*?)(?=^## |\Z)", re.M | re.S)
    m = pattern.search(a["content"])
    if not m:
        raise HTTPException(404, "Sección no encontrada")
    prompt = (f"Reescribe esta sección del artículo '{a['title']}' mejorándola. {body.instructions}\n"
              "Mantén el encabezado '## " + body.heading + "', el formato Markdown y los marcadores [[...]] si los hay. Devuelve solo la sección.\n\n" + m.group(1))
    new = (await complete(prompt, build_system(p), await pick_provider(p.get("llm_provider")), p["id"], aid, "regenerar_seccion")).strip()
    if not new.startswith("## "):
        new = f"## {body.heading}\n\n{new}"
    content = a["content"][:m.start()] + new + "\n\n" + a["content"][m.end():]
    return await update_article(aid, {"content": content}, user)


async def has_image_key():
    return bool(await get_key("openai") or await get_key("gemini"))


async def create_image(aid, kind="cover", style=None):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    style = style or "fotografía editorial limpia, luz natural, sin texto"
    prompt = (f"Imagen de portada para un artículo de blog titulado '{a['title']}' de la marca {(p.get('brand') or {}).get('brand_name') or p['name']}. {style}."
              if kind == "cover" else
              f"Infografía clara y minimalista en español que resume: {'; '.join((a.get('key_points') or [])[:5]) or a['title']}. Texto legible y corto.")
    data = None
    if await get_key("openai"):
        client = openai.AsyncOpenAI(api_key=await get_key("openai"))
        try:
            r = await client.images.generate(model="gpt-image-1", prompt=prompt, size="1536x1024", quality="medium")
            data = base64.b64decode(r.data[0].b64_json)
        except Exception as e:
            raise HTTPException(502, f"OpenAI imágenes: {str(e)[:200]}")
    elif await get_key("gemini"):
        from google import genai
        gc = genai.Client(api_key=await get_key("gemini"))
        try:
            r = await gc.aio.models.generate_content(model="gemini-2.5-flash-image", contents=prompt)
            for part in r.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    data = part.inline_data.data
        except Exception as e:
            raise HTTPException(502, f"Gemini imágenes: {str(e)[:200]}")
    else:
        raise HTTPException(400, "Para imágenes necesitas la clave de OpenAI o de Gemini.")
    if not data:
        raise HTTPException(502, "No se generó ninguna imagen")
    fid = await fs.upload_from_stream(f"{aid}-{kind}.png", data, metadata={"contentType": "image/png", "project_id": p["id"]})
    base = os.environ.get("PUBLIC_URL", "").rstrip("/") or p.get("base_url", "")
    url = f"{base}/api/media/{fid}"
    await db.usage.insert_one({"_id": new_id(), "provider": "openai" if await get_key("openai") else "gemini", "project_id": p["id"],
                               "article_id": aid, "purpose": "imagen", "input_tokens": 0, "output_tokens": 0, "cost": 0.04,
                               "month": iso()[:7], "created_at": iso()})
    img = {"kind": kind, "url": url, "created_at": iso()}
    upd = {"$push": {"images": img}}
    if kind == "cover":
        upd["$set"] = {"cover_url": url}
        upd["$unset"] = {"cover_error": ""}
    await db.articles.update_one({"_id": aid}, upd)
    return img


@router.post("/articles/{aid}/image")
async def generate_image(aid: str, body: dict, user=Depends(current_user)):
    return await create_image(aid, body.get("kind", "cover"), body.get("style"))


@router.post("/articles/{aid}/images/delete")
async def delete_image(aid: str, body: dict, user=Depends(current_user)):
    a = await get_article(aid)
    url = body.get("url") or ""
    if url not in [i.get("url") for i in a.get("images") or []] and url != a.get("cover_url"):
        raise HTTPException(404, "Imagen no encontrada en este artículo")
    upd = {"$pull": {"images": {"url": url}}}
    if url == a.get("cover_url"):
        upd["$unset"] = {"cover_url": ""}
    await db.articles.update_one({"_id": aid}, upd)
    fid = url.rstrip("/").split("/api/media/")[-1]
    try:
        await fs.delete(ObjectId(fid))
    except Exception:
        pass
    return {"ok": True}


COVER_JOBS = {}


async def cover_safe(aid):
    try:
        await create_image(aid, "cover")
        return True
    except Exception as e:
        await db.articles.update_one({"_id": aid}, {"$set": {"cover_error": str(getattr(e, "detail", e))[:200]}})
        return False


async def run_covers(pid, ids):
    job = COVER_JOBS[pid]
    for aid in ids:
        if await cover_safe(aid):
            job["done"] += 1
        else:
            job["errors"] += 1
    job["running"] = False


def missing_cover_query(pid):
    return {"project_id": pid, "status": {"$ne": "generating"}, "$or": [{"cover_url": None}, {"cover_url": ""}, {"cover_url": {"$exists": False}}]}


def start_covers(pid, ids):
    if not ids or (COVER_JOBS.get(pid) or {}).get("running"):
        return False
    COVER_JOBS[pid] = {"running": True, "total": len(ids), "done": 0, "errors": 0}
    asyncio.create_task(run_covers(pid, ids))
    return True


@router.get("/projects/{pid}/covers")
async def covers_status(pid: str, user=Depends(current_user)):
    return {"missing": await db.articles.count_documents(missing_cover_query(pid)), "has_key": await has_image_key(),
            "job": COVER_JOBS.get(pid)}


@router.post("/projects/{pid}/covers/missing")
async def covers_missing(pid: str, user=Depends(current_user)):
    if not await has_image_key():
        raise HTTPException(400, "Para crear portadas necesitas la clave de OpenAI o de Gemini en Ajustes.")
    if (COVER_JOBS.get(pid) or {}).get("running"):
        raise HTTPException(409, "Ya se están creando portadas para este proyecto.")
    ids = [a["_id"] async for a in db.articles.find(missing_cover_query(pid), {"_id": 1})]
    start_covers(pid, ids)
    return {"queued": len(ids)}


@router.post("/articles/{aid}/repurpose")
async def repurpose(aid: str, user=Depends(current_user)):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    url = article_url(p, a)
    prompt = f"""A partir de este artículo crea contenidos listos para copiar, en el idioma del artículo, enlazando a {url}:
{{"newsletter": "email de newsletter con asunto en la primera línea (Asunto: ...), 150-220 palabras",
"linkedin": "post de LinkedIn con gancho, 120-200 palabras, 3 hashtags",
"x_thread": ["tweet 1 (<270 caracteres)", "... 5-7 tweets"],
"video_script": "guion de vídeo corto de 45-60 s con [GANCHO], [DESARROLLO], [CTA]",
"google_business": "post para Google Business Profile, máx 1.200 caracteres, con CTA"}}
ARTÍCULO: {a['content'][:8000]}"""
    res = await complete_json(prompt, build_system(p), await pick_provider(p.get("llm_provider")), project_id=p["id"],
                              article_id=aid, purpose="reutilizacion")
    await db.articles.update_one({"_id": aid}, {"$set": {"repurposed": res}})
    return res


@router.get("/articles/{aid}/link-suggestions")
async def link_suggestions(aid: str, user=Depends(current_user)):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    target = article_url(p, a)
    terms = [t for t in {(a.get("keyword") or "").strip(), a["title"].strip()} if len(t) > 3]
    out = []
    async for o in db.articles.find({"project_id": p["id"], "_id": {"$ne": aid}, "status": {"$in": ["published", "draft", "review", "scheduled"]}}):
        content = o.get("content", "")
        if target in content:
            continue
        for term in terms:
            m = re.search(rf"(?<![\[\w]){re.escape(term)}(?![\w\]])", content, re.I)
            if m:
                s = max(0, m.start() - 80)
                out.append({"source_id": o["_id"], "source_title": o["title"], "anchor": m.group(0),
                            "snippet": content[s:m.end() + 80].replace("\n", " ")})
                break
    return {"target_url": target, "suggestions": out}


@router.post("/articles/{aid}/apply-link")
async def apply_link(aid: str, body: dict, user=Depends(current_user)):
    a = await get_article(aid)
    p = await get_project(a["project_id"])
    src = await get_article(body["source_id"])
    anchor = body["anchor"]
    new = re.sub(rf"(?<![\[\w]){re.escape(anchor)}(?![\w\]])", f"[{anchor}]({article_url(p, a)})", src["content"], count=1)
    await db.articles.update_one({"_id": src["id"]}, {"$set": {"content": new, "updated_at": iso()}})
    return {"ok": new != src["content"]}


@router.post("/articles/{aid}/publish")
async def publish(aid: str, user=Depends(current_user)):
    return await publish_article(aid)


@router.post("/articles/{aid}/schedule")
async def schedule(aid: str, body: dict, user=Depends(current_user)):
    from publisher import check_publishable
    check_publishable(await get_article(aid))
    await db.articles.update_one({"_id": aid}, {"$set": {"status": "scheduled", "publish_at": body["publish_at"]}})
    return await get_article(aid)


@router.post("/articles/{aid}/unpublish")
async def unpublish(aid: str, user=Depends(current_user)):
    await db.articles.update_one({"_id": aid}, {"$set": {"status": "draft"}, "$unset": {"publish_at": ""}})
    return await get_article(aid)
