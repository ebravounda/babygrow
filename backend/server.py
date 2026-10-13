from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db, clean, now, iso
import routes_main, routes_articles, routes_public, routes_insights, routes_import
from routes_articles import generate_events, GenIn, factcheck_internal
from publisher import publish_article

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("motorseo")

app = FastAPI(title="Motor SEO/AEO")
for r in (routes_main, routes_articles, routes_public, routes_insights, routes_import):
    app.include_router(r.router)


@app.get("/api/")
async def root():
    return {"message": "Motor SEO/AEO activo"}


app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
scheduler = AsyncIOScheduler(timezone="UTC")


async def publish_due():
    async for a in db.articles.find({"status": "scheduled", "publish_at": {"$lte": iso()}}):
        try:
            await publish_article(a["_id"])
            log.info("Publicado programado %s", a["_id"])
        except Exception as e:
            await db.articles.update_one({"_id": a["_id"]}, {"$set": {"status": "review", "publish_errors": [str(getattr(e, "detail", e))]}})


async def autopilot():
    t = now()
    async for p in db.projects.find({"autopilot.enabled": True}):
        cad = p.get("cadence") or {}
        if t.isoweekday() not in (cad.get("days") or []) or t.hour < int(cad.get("hour", 9)):
            continue
        day = t.strftime("%Y-%m-%d")
        if await db.articles.count_documents({"project_id": p["_id"], "autopilot": True, "created_at": {"$gte": day}}):
            continue
        week_start = (t - timedelta(days=t.weekday())).strftime("%Y-%m-%d")
        if await db.articles.count_documents({"project_id": p["_id"], "autopilot": True, "created_at": {"$gte": week_start}}) >= int(cad.get("per_week", 3)):
            continue
        topic = await db.topics.find_one({"project_id": p["_id"], "status": "aprobado"}, sort=[("day", 1)])
        if not topic:
            continue
        author = await db.authors.find_one({"project_id": p["_id"]})
        aid = None
        async for ev in generate_events(GenIn(topic_id=topic["_id"], author_id=author["_id"] if author else ""), status="review"):
            if ev["t"] == "start":
                aid = ev["article_id"]
            if ev["t"] == "error":
                log.warning("Autopiloto error %s: %s", p["_id"], ev["c"])
        if not aid:
            continue
        await db.articles.update_one({"_id": aid}, {"$set": {"autopilot": True}})
        try:
            await factcheck_internal(aid)
            if (p.get("autopilot") or {}).get("auto_publish"):
                await publish_article(aid)
        except Exception as e:
            await db.articles.update_one({"_id": aid}, {"$set": {"publish_errors": [str(getattr(e, "detail", e))]}})


async def visibility_cron():
    from routes_insights import run_prompt
    t = now()
    async for q in db.prompts.find():
        last = q.get("last_run")
        gap = timedelta(days=1 if q.get("frequency") == "daily" else 7)
        if last and datetime.fromisoformat(last) + gap > t:
            continue
        p = await db.projects.find_one({"_id": q["project_id"]})
        if p:
            await run_prompt(clean(q), clean(p))


@app.on_event("startup")
async def startup():
    await routes_main.seed_admin()
    scheduler.add_job(publish_due, "interval", minutes=2, id="publish", replace_existing=True, max_instances=1)
    scheduler.add_job(autopilot, "interval", minutes=15, id="autopilot", replace_existing=True, max_instances=1)
    scheduler.add_job(visibility_cron, "interval", hours=1, id="visibility", replace_existing=True, max_instances=1)
    scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
