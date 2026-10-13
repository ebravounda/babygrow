import html as h
from datetime import datetime
from email.utils import format_datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, HTMLResponse, PlainTextResponse
from pydantic import BaseModel

from core import db, clean, new_id, iso, get_project, get_key, fs, base_url
from content import render_html, jsonld, llms_txt, to_json
from publisher import article_url

router = APIRouter(prefix="/api")

ARTICLE_CSS = """
.mseo-root{font-family:inherit;color:inherit;line-height:1.7}
.mseo-root h2{font-size:1.5em;margin:1.6em 0 .5em;line-height:1.25}.mseo-root h3{font-size:1.2em;margin:1.3em 0 .4em}
.mseo-root table{width:100%;border-collapse:collapse;margin:1.2em 0;font-size:.95em}.mseo-root th,.mseo-root td{border:1px solid #e5e7eb;padding:.55em .7em;text-align:left}
.mseo-root th{background:#f9fafb}.mseo-root blockquote{border-left:3px solid var(--mseo-c);margin:1.2em 0;padding:.4em 1em;background:#f9fafb;font-style:italic}
.mseo-root img{max-width:100%;border-radius:10px}.mseo-root a{color:var(--mseo-c)}
.mseo-toc{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:1em 1.4em;margin:1.2em 0}.mseo-toc ol{margin:.5em 0 0;padding-left:1.2em}
.mseo-product{border:2px solid var(--mseo-c);border-radius:12px;padding:1.1em 1.3em;margin:1.8em 0;background:#fff}
.mseo-product-label{font-size:.72em;text-transform:uppercase;letter-spacing:.08em;color:var(--mseo-c);font-weight:700}
.mseo-product a,.mseo-cta a,.mseo-btn{display:inline-block;background:var(--mseo-c);color:#fff!important;padding:.6em 1.2em;border-radius:8px;text-decoration:none;font-weight:600;border:0;cursor:pointer}
.mseo-price{opacity:.7;margin-left:.4em}.mseo-cta{background:#111827;color:#fff;border-radius:12px;padding:1.4em;margin:2em 0}.mseo-cta p{margin:0 0 .8em}
.mseo-disclaimer{font-size:.85em;background:#fff7ed;border:1px solid #fed7aa;padding:.7em 1em;border-radius:8px}
.mseo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.2em}.mseo-list{display:flex;flex-direction:column;gap:1em}
.mseo-card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;cursor:pointer;background:#fff;transition:transform .2s,box-shadow .2s;text-decoration:none;color:inherit;display:block}
.mseo-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}.mseo-card img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:0}
.mseo-card div{padding:1em}.mseo-card h3{margin:0 0 .4em;font-size:1.1em}.mseo-card p{margin:0;opacity:.75;font-size:.92em}
.mseo-meta{font-size:.85em;opacity:.65}.mseo-back{background:none;border:0;color:var(--mseo-c);cursor:pointer;padding:0;font:inherit;margin-bottom:1em}
.mseo-lead{border:1px solid #e5e7eb;border-radius:12px;padding:1.2em;margin:2em 0}.mseo-lead input,.mseo-lead textarea{width:100%;box-sizing:border-box;padding:.6em;border:1px solid #d1d5db;border-radius:8px;margin:.3em 0 .7em;font:inherit}
"""


async def project_by_key(pid, key):
    p = await get_project(pid)
    if key != p["public_key"]:
        raise HTTPException(403, "Clave de conexión no válida")
    return p


def public_article(a, full=False):
    keys = ["id", "title", "slug", "excerpt", "meta_title", "meta_description", "cover_url", "published_at", "keyword", "cluster"]
    return {k: a.get(k) for k in keys}


@router.get("/media/{fid}")
async def media(fid: str):
    try:
        stream = await fs.open_download_stream(ObjectId(fid))
    except Exception:
        raise HTTPException(404, "No encontrado")
    data = await stream.read()
    return Response(data, media_type=(stream.metadata or {}).get("contentType", "image/png"),
                    headers={"Cache-Control": "public, max-age=31536000"})


async def published(pid, limit=200):
    return [clean(a) async for a in db.articles.find({"project_id": pid, "status": "published"}).sort("published_at", -1).limit(limit)]


@router.get("/public/{pid}/articles")
async def api_articles(pid: str, key: str = ""):
    await project_by_key(pid, key)
    return [public_article(a) for a in await published(pid)]


@router.get("/public/{pid}/articles/{slug}")
async def api_article(pid: str, slug: str, key: str = ""):
    p = await project_by_key(pid, key)
    a = clean(await db.articles.find_one({"project_id": pid, "slug": slug, "status": "published"}))
    if not a:
        raise HTTPException(404, "Artículo no encontrado")
    author = clean(await db.authors.find_one({"_id": a.get("author_id")})) if a.get("author_id") else None
    return {**public_article(a), "html": render_html(p, a), "faq": a.get("faq"), "key_points": a.get("key_points"),
            "author": author, "jsonld": jsonld(p, a, author, article_url(p, a)), "url": article_url(p, a)}


@router.get("/public/{pid}/rss")
async def rss(pid: str, key: str = ""):
    p = await project_by_key(pid, key)
    items = ""
    for a in await published(pid, 50):
        d = format_datetime(datetime.fromisoformat(a["published_at"]))
        items += (f"<item><title>{h.escape(a['title'])}</title><link>{h.escape(article_url(p, a))}</link>"
                  f"<guid>{h.escape(article_url(p, a))}</guid><pubDate>{d}</pubDate><description>{h.escape(a.get('meta_description', ''))}</description></item>")
    xml = (f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>{h.escape(p["name"])}</title>'
           f'<link>{h.escape(p["url"])}</link><description>{h.escape((p.get("brand") or {}).get("offer", ""))}</description>{items}</channel></rss>')
    return Response(xml, media_type="application/rss+xml")


@router.get("/public/{pid}/sitemap.xml")
async def sitemap(pid: str, key: str = ""):
    p = await project_by_key(pid, key)
    urls = "".join(f"<url><loc>{h.escape(article_url(p, a))}</loc><lastmod>{(a.get('updated_at') or a['published_at'])[:10]}</lastmod></url>"
                   for a in await published(pid, 5000))
    return Response(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>',
                    media_type="application/xml")


@router.get("/public/{pid}/llms.txt")
async def llms(pid: str):
    p = await get_project(pid)
    arts = await published(pid)
    base = (p.get("blog_url_pattern") or f"{p.get('base_url', '')}/api/blog/{pid}/{{slug}}").rsplit("/{slug}", 1)[0]
    return PlainTextResponse(llms_txt(p, arts, base))


class TrackIn(BaseModel):
    key: str
    type: str
    article_id: str = ""
    session: str = ""


@router.post("/public/{pid}/track")
async def track(pid: str, body: TrackIn):
    await project_by_key(pid, body.key)
    if body.type not in ("list_view", "view", "product_click", "cta_click", "lead"):
        raise HTTPException(400, "Evento no válido")
    await db.events.insert_one({"_id": new_id(), "project_id": pid, "article_id": body.article_id or None, "type": body.type,
                                "session": body.session[:64], "created_at": iso()})
    return {"ok": True}


class LeadIn(BaseModel):
    key: str
    email: str
    name: str = ""
    message: str = ""
    article_id: str = ""


async def send_lead_email(p, lead):
    key = await get_key("resend")
    from_email = (await db.api_keys.find_one({"_id": "resend"}) or {}).get("extra", {}).get("from_email")
    if not key or not from_email or not p.get("notify_email"):
        return "sin_configurar"
    import resend
    resend.api_key = key
    try:
        e = lambda s: h.escape(s or "—")
        resend.Emails.send({"from": from_email, "to": [p["notify_email"]], "reply_to": lead["email"],
                            "subject": f"Nuevo contacto desde el blog de {p['name']}",
                            "html": f"<h2>Nuevo contacto</h2><p><b>Nombre:</b> {e(lead['name'])}</p><p><b>Email:</b> {e(lead['email'])}</p>"
                                    f"<p><b>Artículo:</b> {e(lead.get('article_title'))}</p><p><b>Mensaje:</b> {e(lead['message'])}</p>"})
        return "enviado"
    except Exception as ex:
        return f"error: {str(ex)[:150]}"


@router.post("/public/{pid}/lead")
async def lead(pid: str, body: LeadIn):
    p = await project_by_key(pid, body.key)
    if "@" not in body.email or len(body.email) > 200:
        raise HTTPException(400, "Email no válido")
    art = await db.articles.find_one({"_id": body.article_id}, {"title": 1}) if body.article_id else None
    doc = {"_id": new_id(), "project_id": pid, "email": body.email.strip(), "name": body.name[:120], "message": body.message[:2000],
           "article_id": body.article_id or None, "article_title": (art or {}).get("title"), "status": "nuevo", "created_at": iso()}
    doc["email_status"] = await send_lead_email(p, doc)
    await db.leads.insert_one(doc)
    await db.events.insert_one({"_id": new_id(), "project_id": pid, "article_id": body.article_id or None, "type": "lead", "created_at": iso()})
    return {"ok": True}


WIDGET_JS = r"""(function(){var C=__CFG__;var root=document.getElementById(C.target)||(function(){var d=document.createElement('div');d.id=C.target;document.currentScript.parentNode.insertBefore(d,document.currentScript);return d})();
var st=document.createElement('style');st.textContent=C.css;document.head.appendChild(st);root.className='mseo-root';root.style.setProperty('--mseo-c',C.color);
var S=localStorage.getItem('mseo_s')||Math.random().toString(36).slice(2);localStorage.setItem('mseo_s',S);
function api(p,o){return fetch(C.api+p+(p.indexOf('?')>-1?'&':'?')+'key='+C.key,o).then(function(r){return r.json()})}
function track(t,a){fetch(C.api+'/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:C.key,type:t,article_id:a||'',session:S})})}
function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function list(){track('list_view');api('/articles').then(function(arts){if(!arts.length){root.innerHTML='<p>Pronto publicaremos artículos.</p>';return}
root.innerHTML='<div class="mseo-'+C.layout+'">'+arts.map(function(a){return '<a class="mseo-card" href="#articulo/'+a.slug+'">'+(a.cover_url?'<img src="'+a.cover_url+'" alt="'+esc(a.title)+'" loading="lazy">':'')+'<div><h3>'+esc(a.title)+'</h3><p>'+esc(a.excerpt||a.meta_description)+'</p></div></a>'}).join('')+'</div>'})}
function lead(aid){if(!C.lead)return '';return '<form class="mseo-lead" data-aid="'+aid+'"><strong>'+esc(C.leadTitle)+'</strong><input name="name" placeholder="Nombre"><input name="email" type="email" required placeholder="Email"><textarea name="message" rows="3" placeholder="¿En qué podemos ayudarte?"></textarea><button class="mseo-btn" type="submit">Enviar</button></form>'}
function show(slug){api('/articles/'+slug).then(function(a){if(a.detail){list();return}document.title=a.meta_title||a.title;
var ld=document.createElement('script');ld.type='application/ld+json';ld.text=JSON.stringify(a.jsonld);document.head.appendChild(ld);
root.innerHTML='<button class="mseo-back" onclick="location.hash=\'\'">← Todos los artículos</button><article><h1>'+esc(a.title)+'</h1><p class="mseo-meta">'+(a.author?esc(a.author.name)+' · ':'')+new Date(a.published_at).toLocaleDateString()+'</p>'+(a.cover_url?'<img src="'+a.cover_url+'" alt="'+esc(a.title)+'">':'')+a.html+lead(a.id)+'</article>';
track('view',a.id);root.setAttribute('data-aid',a.id);window.scrollTo(0,root.offsetTop-20)})}
root.addEventListener('click',function(e){var l=e.target.closest('a[data-track]');if(l)track(l.getAttribute('data-track'),root.getAttribute('data-aid'))});
root.addEventListener('submit',function(e){e.preventDefault();var f=e.target;var d={key:C.key,name:f.name.value,email:f.email.value,message:f.message.value,article_id:f.getAttribute('data-aid')};
fetch(C.api+'/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){f.innerHTML=r.ok?'<strong>¡Gracias! Te contactaremos pronto.</strong>':'<strong>No se pudo enviar. Revisa el email.</strong>'})});
function route(){var m=location.hash.match(/^#articulo\/(.+)$/);m?show(m[1]):list()}window.addEventListener('hashchange',route);route()})();"""


@router.get("/public/{pid}/widget.js")
async def widget(pid: str, request: Request, key: str = "", target: str = "blog-seo"):
    p = await project_by_key(pid, key)
    w = p.get("widget") or {}
    cfg = {"api": f"{base_url(request)}/api/public/{pid}", "key": key, "target": target, "color": w.get("color", "#10B981"),
           "layout": w.get("layout", "grid"), "lead": w.get("lead_form", True),
           "leadTitle": w.get("lead_title") or "¿Quieres que te ayudemos? Déjanos tu email.", "css": ARTICLE_CSS}
    return Response(WIDGET_JS.replace("__CFG__", to_json(cfg)), media_type="application/javascript",
                    headers={"Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*"})


def page(p, title, desc, body, canonical, extra_head=""):
    color = (p.get("widget") or {}).get("color", "#10B981")
    lang = p.get("lang_code", "es")
    return HTMLResponse(f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{h.escape(title)}</title><meta name="description" content="{h.escape(desc)}"><link rel="canonical" href="{h.escape(canonical)}">
<link rel="alternate" hreflang="{lang}" href="{h.escape(canonical)}"><meta property="og:title" content="{h.escape(title)}"><meta property="og:description" content="{h.escape(desc)}">
{extra_head}<style>body{{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:0 auto;padding:2em 1.2em;color:#111827}}h1{{line-height:1.2}}{ARTICLE_CSS}</style></head>
<body><div class="mseo-root" style="--mseo-c:{color}">{body}</div></body></html>""")


@router.get("/blog/{pid}", response_class=HTMLResponse)
async def blog_index(pid: str, request: Request):
    p = await get_project(pid)
    arts = await published(pid)
    def card(a):
        img = f'<img src="{a["cover_url"]}" alt="">' if a.get("cover_url") else ""
        return (f'<a class="mseo-card" href="{h.escape(article_url(p, a))}">{img}'
                f'<div><h3>{h.escape(a["title"])}</h3><p>{h.escape(a.get("excerpt") or "")}</p></div></a>')
    cards = "".join(card(a) for a in arts)
    name = (p.get("brand") or {}).get("brand_name") or p["name"]
    return page(p, f"Blog de {name}", (p.get("brand") or {}).get("offer", ""), f"<h1>Blog de {h.escape(name)}</h1><div class='mseo-grid'>{cards}</div>",
                f"{base_url(request)}/api/blog/{pid}")


@router.get("/blog/{pid}/{slug}", response_class=HTMLResponse)
async def blog_article(pid: str, slug: str, request: Request):
    p = await get_project(pid)
    a = clean(await db.articles.find_one({"project_id": pid, "slug": slug, "status": "published"}))
    if not a:
        raise HTTPException(404, "Artículo no encontrado")
    author = clean(await db.authors.find_one({"_id": a.get("author_id")})) if a.get("author_id") else None
    url = article_url(p, a)
    ld = f'<script type="application/ld+json">{to_json(jsonld(p, a, author, url))}</script>'
    by = f'<p class="mseo-meta">{h.escape(author["name"]) + " · " if author else ""}{a["published_at"][:10]}</p>'
    bio = (f'<div class="mseo-toc"><strong>Sobre el autor: {h.escape(author["name"])}</strong><p>{h.escape(author.get("bio") or "")}</p></div>'
           if author else "")
    cover = f'<img src="{a["cover_url"]}" alt="{h.escape(a["title"])}">' if a.get("cover_url") else ""
    await db.events.insert_one({"_id": new_id(), "project_id": pid, "article_id": a["id"], "type": "view", "source": "ssr", "created_at": iso()})
    return page(p, a.get("meta_title") or a["title"], a.get("meta_description", ""),
                f'<a href="{base_url(request)}/api/blog/{pid}">← Blog</a><article><h1>{h.escape(a["title"])}</h1>{by}{cover}{render_html(p, a)}{bio}</article>',
                url, ld)
