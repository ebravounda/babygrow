import os
import re
import uuid
import secrets
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
fs = AsyncIOMotorGridFSBucket(db)
fernet = Fernet(os.environ["FERNET_KEY"].encode())
JWT_ALG = "HS256"


def now():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now()).isoformat()


def new_id():
    return uuid.uuid4().hex


def token():
    return secrets.token_urlsafe(24)


def clean(doc):
    if not doc:
        return None
    d = dict(doc)
    d["id"] = str(d.pop("_id"))
    return d


def slugify(text):
    t = text.lower()
    for a, b in zip("áéíóúüñàèìòù", "aeiouunaeiou"):
        t = t.replace(a, b)
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:80] or new_id()[:8]


def encrypt(v):
    return fernet.encrypt(v.encode()).decode()


def decrypt(v):
    return fernet.decrypt(v.encode()).decode()


def mask(v):
    return (v[:4] + "••••••••" + v[-4:]) if len(v) > 10 else "••••••••"


def base_url(request: Request):
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0]
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    return f"{proto}://{host}"


def hash_password(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p, h):
    return bcrypt.checkpw(p.encode(), h.encode())


def create_token(user_id, email):
    payload = {"sub": user_id, "email": email, "exp": now() + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALG)


async def current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    tok = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("access_token")
    if not tok:
        raise HTTPException(401, "No autenticado")
    try:
        payload = jwt.decode(tok, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesión caducada")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    user = await db.users.find_one({"_id": payload["sub"]}, {"password_hash": 0})
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return clean(user)


async def get_key(name):
    doc = await db.api_keys.find_one({"_id": name})
    return decrypt(doc["value"]) if doc else None


async def get_key_extra(name):
    doc = await db.api_keys.find_one({"_id": name})
    return (doc or {}).get("extra", {})


async def get_project(pid):
    p = await db.projects.find_one({"_id": pid})
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    return clean(p)


async def get_article(aid):
    a = await db.articles.find_one({"_id": aid})
    if not a:
        raise HTTPException(404, "Artículo no encontrado")
    return clean(a)
