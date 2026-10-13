import json
import re
import html as htmllib

import markdown as md

UTM = "utm_source=blog&utm_medium=articulo&utm_campaign={slug}"


def with_utm(url, slug, content="producto"):
    if not url:
        return "#"
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{UTM.format(slug=slug)}&utm_content={content}"


def build_system(project):
    b = project.get("brand", {}) or {}
    return (
        f"Eres un redactor SEO/AEO experto y estratega de contenidos de marca para {b.get('brand_name') or project['name']}. "
        f"Escribes en {project.get('language', 'español')} para lectores de {project.get('country', 'España')}. "
        f"Tono de marca: {b.get('tone') or 'cercano, experto y claro'}. Público: {project.get('audience') or b.get('audience') or 'general'}. "
        "Escribes contenido útil, concreto, con respuestas directas que los motores de IA puedan citar, y orientado a convertir sin ser agresivo. "
        "NUNCA inventas cifras, estudios ni citas: si no tienes una fuente real, no pongas la cifra."
    )


def build_article_prompt(project, topic, interview, author, words):
    b = project.get("brand", {}) or {}
    catalog = project.get("catalog") or []
    prod = topic.get("product") or (catalog[0]["name"] if catalog else "")
    links = (b.get("pages_to_link") or [])[:12] + (topic.get("internal_links") or [])
    links_txt = "\n".join(f"- {l.get('title')}: {l.get('url')}" for l in links) or "- (no hay páginas; omite enlaces internos)"
    cat_txt = "\n".join(f"- {c.get('name')}: {c.get('benefit', '')} ({c.get('price', '')})" for c in catalog) or "- (sin catálogo)"
    inter = "\n".join(f"P: {x.get('q')}\nR: {x.get('a')}" for x in (interview or []) if x.get("a"))
    kind = topic.get("type", "guia")
    extra = ""
    if kind in ("comparativa", "alternativas"):
        extra = ("Es una página de comparación de alta intención de compra: incluye una tabla comparativa detallada "
                 "(precio, puntos fuertes, puntos débiles, para quién es), un veredicto honesto y por qué nuestra marca encaja para cierto perfil. "
                 "Sé justo con los competidores, sin afirmaciones no verificables.")
    return f"""Redacta un artículo completo de unas {words} palabras.
Título: {topic['title']}
Palabra clave principal: {topic.get('keyword') or topic['title']}
Intención de búsqueda: {topic.get('intent', 'media')}
Tipo: {kind}. {extra}
Oferta de la marca: {b.get('offer', '')}
Producto a impulsar en este artículo: {prod}
Catálogo:
{cat_txt}
Páginas para enlazar internamente (usa 2-4, con anchor natural):
{links_txt}
Autor: {(author or {}).get('name', 'equipo editorial')} — {(author or {}).get('credentials', '')}
Experiencia real del autor (entrevista). Conviértela en citas en bloque (> ...), casos y consejos propios, atribuidos al autor:
{inter or '(sin entrevista: no inventes experiencias personales)'}

FORMATO MARKDOWN ESTRICTO:
1. No incluyas el título H1. Empieza con un párrafo de 2-3 frases que responda directamente a la pregunta principal e incluya la palabra clave.
2. Después, una sección "## Puntos clave" con 4-6 viñetas breves.
3. 5-8 secciones "## " con subsecciones "### " cuando aporten. Párrafos cortos (máx. 3-4 frases). Usa listas y al menos una tabla Markdown.
4. Hacia la mitad del artículo, en una línea sola, escribe exactamente: [[PRODUCTO: {prod or 'nombre del producto'}]]
5. Incluye una sección "## Preguntas frecuentes" con 4-6 preguntas en formato "### ¿Pregunta?" y respuestas de 2-3 frases.
6. Termina con "## Conclusión" y en la última línea sola escribe exactamente: [[CTA]]
7. Si mencionas cifras o datos, añade la fuente como enlace Markdown real. Si no conoces una fuente real, no pongas la cifra.
Escribe ya el artículo, sin comentarios previos."""


def meta_prompt(project, topic, content):
    return f"""Analiza este artículo y devuelve un JSON con:
{{"meta_title": "máx 60 caracteres con la palabra clave", "meta_description": "140-155 caracteres persuasiva",
"slug": "url-corta-sin-stopwords", "excerpt": "resumen de 1-2 frases",
"sensitive": {{"is_sensitive": true/false, "category": "salud|finanzas|legal|ninguna", "disclaimer": "aviso legal breve adecuado o vacío",
"risky_phrases": ["frases exactas del texto que prometan resultados o den consejo arriesgado"]}}}}
Palabra clave: {topic.get('keyword') or topic['title']}
ARTÍCULO:
{content[:9000]}"""


def headings(content, level=2):
    return re.findall(rf"^{'#' * level} (.+)$", content, re.M)


def extract_faq(content):
    m = re.search(r"^## Preguntas frecuentes\s*$(.*?)(?=^## |\Z)", content, re.M | re.S)
    if not m:
        return []
    parts = re.split(r"^### (.+)$", m.group(1), flags=re.M)
    faq = []
    for i in range(1, len(parts) - 1, 2):
        ans = re.sub(r"\s+", " ", parts[i + 1]).strip()
        if ans:
            faq.append({"q": parts[i].strip(), "a": ans})
    return faq


def extract_key_points(content):
    m = re.search(r"^## Puntos clave\s*$(.*?)(?=^## |\Z)", content, re.M | re.S)
    return [x.strip() for x in re.findall(r"^[-*] (.+)$", m.group(1), re.M)] if m else []


def numeric_claims(content):
    text = re.sub(r"\|.*\|", " ", content)
    sents = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip()[:400] for s in sents if re.search(r"\d+([.,]\d+)?\s*(%|por ciento|millones|euros|€|\$|usuarios|personas|veces)", s)][:15]


def jsonld(project, article, author, url):
    b = project.get("brand", {}) or {}
    person = {"@type": "Person", "name": (author or {}).get("name") or b.get("brand_name") or project["name"]}
    if author:
        person.update({k: v for k, v in {"description": author.get("bio"), "image": author.get("photo_url"),
                                          "jobTitle": author.get("credentials"),
                                          "sameAs": [s for s in (author.get("same_as") or "").split(",") if s.strip()] or None}.items() if v})
    graph = [{
        "@type": "BlogPosting", "headline": article.get("meta_title") or article["title"],
        "description": article.get("meta_description", ""), "inLanguage": project.get("lang_code", "es"),
        "datePublished": article.get("published_at") or article.get("created_at"),
        "dateModified": article.get("updated_at") or article.get("created_at"),
        "author": person, "mainEntityOfPage": url,
        "publisher": {"@type": "Organization", "name": b.get("brand_name") or project["name"], "url": project.get("url")},
        **({"image": article["cover_url"]} if article.get("cover_url") else {}),
    }]
    if article.get("faq"):
        graph.append({"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in article["faq"]]})
    return {"@context": "https://schema.org", "@graph": graph}


def product_box(project, name, slug):
    catalog = project.get("catalog") or []
    p = next((c for c in catalog if c.get("name", "").lower() == (name or "").strip().lower()), None) or (catalog[0] if catalog else None)
    if not p:
        return ""
    url = with_utm(p.get("url"), slug)
    price = f'<span class="mseo-price">{htmllib.escape(str(p.get("price") or ""))}</span>' if p.get("price") else ""
    return (f'<div class="mseo-product"><div class="mseo-product-label">Recomendado</div>'
            f'<strong>{htmllib.escape(p.get("name", ""))}</strong> {price}<p>{htmllib.escape(p.get("benefit") or "")}</p>'
            f'<a href="{url}" data-track="product_click" target="_blank" rel="noopener">Ver {htmllib.escape(p.get("name", ""))}</a></div>')


def cta_box(project, slug):
    cta = project.get("cta") or {}
    url = with_utm(cta.get("url") or project.get("url"), slug, "cta")
    text = htmllib.escape(cta.get("text") or "¿Hablamos? Te ayudamos a dar el siguiente paso.")
    btn = htmllib.escape(cta.get("button") or "Empezar ahora")
    return f'<div class="mseo-cta"><p>{text}</p><a href="{url}" data-track="cta_click" target="_blank" rel="noopener">{btn}</a></div>'


def render_html(project, article, variant=None):
    content = article.get("content", "")
    slug = article.get("slug", "")
    if variant == "b" and article.get("product_b"):
        pass
    content = re.sub(r"^\[\[PRODUCTO:\s*(.*?)\]\]\s*$", lambda m: "\n" + product_box(project, m.group(1), slug) + "\n", content, flags=re.M)
    content = re.sub(r"^\[\[CTA\]\]\s*$", lambda m: "\n" + cta_box(project, slug) + "\n", content, flags=re.M)
    body = md.markdown(content, extensions=["tables", "toc", "sane_lists"])
    toc_items = "".join(f'<li><a href="#{slugify_anchor(h)}">{htmllib.escape(h)}</a></li>' for h in headings(article.get("content", "")))
    toc = f'<nav class="mseo-toc"><strong>Contenido</strong><ol>{toc_items}</ol></nav>' if toc_items else ""
    disc = (article.get("sensitive") or {}).get("disclaimer")
    disclaimer = f'<p class="mseo-disclaimer">{htmllib.escape(disc)}</p>' if disc else ""
    return toc + disclaimer + body


def slugify_anchor(h):
    from markdown.extensions.toc import slugify
    return slugify(h, "-")


def _avg_sentence(text):
    sents = [s for s in re.split(r"[.!?]+\s", re.sub(r"[#>*|`\-\[\]]", " ", text)) if len(s.split()) > 2]
    return sum(len(s.split()) for s in sents) / max(len(sents), 1)


def score_article(project, article):
    c = article.get("content", "")
    kw = (article.get("keyword") or article["title"]).lower()
    words = re.findall(r"\w+", c.lower())
    wc = len(words)
    h2, h3 = headings(c, 2), headings(c, 3)
    tips = []

    def part(checks):
        ok = sum(1 for passed, tip in checks if passed or tips.append(tip))
        return round(ok / len(checks) * 100)

    first = " ".join(words[:120])
    kw_count = c.lower().count(kw)
    density = kw_count * len(kw.split()) / max(wc, 1) * 100
    brand = ((project.get("brand") or {}).get("brand_name") or project["name"]).lower()
    avg = _avg_sentence(c)
    paras = [p for p in c.split("\n\n") if p.strip() and not p.strip().startswith(("#", "|", "-", "*", ">", "[["))]
    long_paras = sum(1 for p in paras if len(p.split()) > 90)
    first_para = next((p for p in paras), "")
    internal = len(re.findall(r"\]\((https?://[^)]+)\)", c))
    breakdown = {
        "estructura": part([(len(h2) >= 5, "Añade al menos 5 secciones H2."), (len(h3) >= 2, "Usa subsecciones H3."),
                            ("|---" in c or "| ---" in c or "|:--" in c, "Incluye una tabla comparativa."),
                            (len(re.findall(r"^[-*] ", c, re.M)) >= 5, "Usa más listas con viñetas."),
                            (wc >= 900, "El artículo es corto; amplía hasta 1.500+ palabras.")]),
        "palabra_clave": part([(kw in first, "Incluye la palabra clave en el primer párrafo."),
                               (any(kw.split()[0] in h.lower() for h in h2) if kw else False, "Incluye la palabra clave en algún H2."),
                               (0.3 <= density <= 3, f"Densidad de palabra clave {density:.1f}%: apunta a 0,5-2%."),
                               (kw in (article.get("meta_title") or "").lower(), "Pon la palabra clave en el meta título."),
                               (len(article.get("meta_description") or "") >= 120, "Meta descripción demasiado corta.")]),
        "legibilidad": part([(avg <= 22, f"Frases largas (media {avg:.0f} palabras); acórtalas."),
                             (long_paras <= 1, "Divide los párrafos largos."),
                             (len(h2) and wc / max(len(h2), 1) < 450, "Secciones muy largas; añade más subtítulos.")]),
        "optimizacion_ia": part([(len(article.get("faq") or []) >= 4, "Añade 4+ preguntas frecuentes."),
                                 (len(article.get("key_points") or []) >= 3, "Añade un bloque de puntos clave."),
                                 (len(first_para.split()) <= 70, "Haz que el primer párrafo responda directo (<70 palabras)."),
                                 ("|" in c, "Las tablas ayudan a que las IAs te citen.")]),
        "marca": part([(c.lower().count(brand) >= 2 if brand else False, "Menciona tu marca al menos 2 veces de forma natural."),
                       (">" in c and bool(article.get("interview")), "Usa el modo entrevista para añadir experiencia real."),
                       (bool(article.get("author_id")), "Asigna un autor con credenciales.")]),
        "venta": part([("[[PRODUCTO" in c, "Falta la caja de producto."), ("[[CTA]]" in c, "Falta la llamada a la acción final."),
                       (internal >= 2, "Añade al menos 2 enlaces internos.")]),
    }
    total = round(sum(breakdown.values()) / len(breakdown))
    return {"total": total, "breakdown": breakdown, "tips": tips[:10], "words": wc}


def llms_txt(project, articles, base):
    b = project.get("brand") or {}
    lines = [f"# {b.get('brand_name') or project['name']}", "", f"> {b.get('offer') or project.get('niche', '')}", "",
             f"Web: {project.get('url', '')}", "", "## Artículos", ""]
    for a in articles:
        lines.append(f"- [{a['title']}]({base}/{a['slug']}): {a.get('excerpt') or a.get('meta_description', '')}")
    if project.get("catalog"):
        lines += ["", "## Productos y servicios", ""]
        lines += [f"- [{c.get('name')}]({c.get('url', '')}): {c.get('benefit', '')}" for c in project["catalog"]]
    return "\n".join(lines)


def to_json(o):
    return json.dumps(o, ensure_ascii=False)
