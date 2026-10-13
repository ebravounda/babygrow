import json
import re
from datetime import datetime
from types import SimpleNamespace

import httpx
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

from core import db, get_key, new_id, iso, now

MODELS = {
    "anthropic": "claude-sonnet-5-5",
    "openai": "gpt-5.6-terra",
    "gemini": "gemini-3.1-pro-preview",
    "perplexity": "fast",
}
LABELS = {"anthropic": "Claude", "openai": "GPT", "gemini": "Gemini", "perplexity": "Perplexity"}
# USD per 1M tokens (input, output), approximate
PRICES = {"anthropic": (3.0, 15.0), "openai": (2.5, 10.0), "gemini": (2.0, 12.0), "perplexity": (1.0, 1.0)}


async def pick_provider(preferred=None):
    order = [preferred] if preferred else []
    order += [p for p in ("anthropic", "openai", "gemini") if p != preferred]
    for p in order:
        if p and await get_key(p):
            return p
    raise HTTPException(400, "No hay ninguna clave de IA configurada. Añade una en Ajustes.")


async def check_budget(project_id):
    if not project_id:
        return
    p = await db.projects.find_one({"_id": project_id}, {"monthly_budget": 1})
    budget = (p or {}).get("monthly_budget") or 0
    if budget <= 0:
        return
    month = now().strftime("%Y-%m")
    agg = await db.usage.aggregate([
        {"$match": {"project_id": project_id, "month": month}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost"}}},
    ]).to_list(1)
    spent = agg[0]["cost"] if agg else 0
    if spent >= budget:
        raise HTTPException(402, f"Límite mensual de gasto alcanzado ({spent:.2f}$ de {budget}$). Súbelo en el proyecto.")


async def record_usage(provider, usage, project_id, article_id, purpose):
    pin, pout = PRICES.get(provider, (0, 0))
    inp, out = (usage.input_tokens or 0), (usage.output_tokens or 0)
    cost = inp / 1e6 * pin + out / 1e6 * pout
    await db.usage.insert_one({
        "_id": new_id(), "provider": provider, "project_id": project_id, "article_id": article_id,
        "purpose": purpose, "input_tokens": inp, "output_tokens": out, "cost": round(cost, 6),
        "month": now().strftime("%Y-%m"), "created_at": iso(),
    })


async def _chat(provider, system):
    key = await get_key(provider)
    if not key:
        raise HTTPException(400, f"Falta la clave de {LABELS.get(provider, provider)}. Añádela en Ajustes.")
    return LlmChat(api_key=key, session_id=new_id(), system_message=system).with_model(provider, MODELS[provider])


async def _perplexity(prompt, system, key):
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post("https://api.perplexity.ai/v1/responses", headers={"Authorization": f"Bearer {key}"},
                         json={"preset": MODELS["perplexity"], "instructions": system, "input": prompt})
    if r.status_code >= 400:
        raise Exception(f"HTTP {r.status_code}: {r.text[:250]}")
    d = r.json()
    text = d.get("output_text") or "".join(
        c.get("text", "") for o in d.get("output", []) if o.get("type") == "message" for c in o.get("content", []))
    u = d.get("usage") or {}
    return text, SimpleNamespace(input_tokens=u.get("input_tokens", 0), output_tokens=u.get("output_tokens", 0))


async def stream(prompt, system, provider, project_id=None, article_id=None, purpose="general"):
    await check_budget(project_id)
    try:
        if provider == "perplexity":
            key = await get_key(provider)
            if not key:
                raise HTTPException(400, "Falta la clave de Perplexity. Añádela en Ajustes.")
            text, usage = await _perplexity(prompt, system, key)
            await record_usage(provider, usage, project_id, article_id, purpose)
            yield text
            return
        chat = await _chat(provider, system)
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                yield ev.content
            elif isinstance(ev, StreamDone):
                await record_usage(provider, ev.usage, project_id, article_id, purpose)
                break
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error de {LABELS.get(provider, provider)}: {str(e)[:300]}")


async def complete(prompt, system, provider, project_id=None, article_id=None, purpose="general"):
    out = []
    async for chunk in stream(prompt, system, provider, project_id, article_id, purpose):
        out.append(chunk)
    return "".join(out)


def parse_json(text):
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    raw = m.group(1) if m else text
    start = min([i for i in (raw.find("{"), raw.find("[")) if i >= 0], default=0)
    raw = raw[start:]
    for end in range(len(raw), 0, -1):
        if raw[end - 1] in "}]":
            try:
                return json.loads(raw[:end])
            except json.JSONDecodeError:
                continue
    raise HTTPException(502, "La IA devolvió un formato inesperado. Inténtalo de nuevo.")


async def complete_json(prompt, system, provider, **kw):
    text = await complete(prompt + "\n\nResponde SOLO con JSON válido, sin texto adicional.", system, provider, **kw)
    return parse_json(text)
