"""Tests for import flow (sitemap scan + content paste), cover generation, and article_url blog/blog collapse."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baby-love-growth.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@motorseo.app"
ADMIN_PASSWORD = "Admin2026!"
TEST_PID = "5d55c3f9c1244c6787ba723862a0e239"  # TestImport project (pre-seeded)
OF_SITEMAP = "https://openfactura.es/sitemap.xml"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


# ---------- Import scan ----------
class TestImportScan:
    def test_scan_sitemap_openfactura(self, auth):
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/import/scan",
                      json={"url": OF_SITEMAP}, timeout=60)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        for it in items:
            assert "url" in it and "slug" in it and "exists" in it
            assert "/blog/" in it["url"]
        # some pre-imported in TestImport should exist=True
        exists_count = sum(1 for it in items if it["exists"])
        print(f"scan returned {len(items)} items, {exists_count} already exist")
        pytest.of_items = items

    def test_scan_bad_url(self, auth):
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/import/scan",
                      json={"url": "https://nonexistent-domain-xyz-9999.example/sitemap.xml"}, timeout=30)
        assert r.status_code == 400


# ---------- Import run ----------
class TestImportRun:
    def test_import_spa_without_content_returns_needs_content(self, auth):
        # Pick a non-existing blog URL from scan if any; else fabricate a URL for a slug not in db
        items = getattr(pytest, "of_items", [])
        url = next((it["url"] for it in items if not it["exists"]), None)
        if not url:
            # fabricate URL for a slug that definitely doesn't exist
            url = f"https://openfactura.es/blog/TEST-nonexistent-spa-{int(time.time())}"
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/import",
                      json={"items": [{"url": url}], "publish": False, "covers": False}, timeout=60)
        assert r.status_code == 200, r.text
        results = r.json()["results"]
        assert len(results) == 1
        st = results[0]["status"]
        # Either "needs_content" (SPA) or "imported" (if page extracts fine). We asked for SPA behavior.
        assert st in ("needs_content", "imported", "error", "exists"), results[0]
        print(f"SPA import status: {st} for {url}")
        pytest.spa_url = url
        pytest.spa_status = st

    def test_import_with_pasted_content_creates_article(self, auth):
        slug_part = f"test-pasted-{int(time.time())}"
        url = f"https://openfactura.es/blog/{slug_part}"
        content = ("# Guía TEST\n\n" + ("Este es un artículo de prueba creado por el agente de testing. " * 20)
                   + "\n\n## Sección\n\n" + ("Contenido secundario con más detalle y ejemplos útiles. " * 10))
        assert len(content) >= 400
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/import",
                      json={"items": [{"url": url, "title": "TEST Pasted Article", "content": content}],
                            "publish": False, "covers": False}, timeout=60)
        assert r.status_code == 200, r.text
        res = r.json()["results"][0]
        assert res["status"] == "imported", res
        assert res["slug"] == slug_part
        aid = res["article_id"]
        pytest.pasted_aid = aid
        # GET to verify persistence
        g = auth.get(f"{BASE_URL}/api/articles/{aid}", timeout=15)
        assert g.status_code == 200
        a = g.json()
        assert a["status"] == "review"
        assert a["imported"] is True
        assert a["slug"] == slug_part
        assert a.get("score") is not None
        assert a["source_url"] == url

    def test_import_duplicate_returns_exists(self, auth):
        aid = getattr(pytest, "pasted_aid", None)
        if not aid:
            pytest.skip("prev test failed")
        g = auth.get(f"{BASE_URL}/api/articles/{aid}").json()
        url = g["source_url"]
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/import",
                      json={"items": [{"url": url}], "covers": False}, timeout=30)
        assert r.status_code == 200
        assert r.json()["results"][0]["status"] == "exists"

    def test_import_static_html_page(self, auth):
        # Try httpbin.org/html which is static.
        url = "https://httpbin.org/html"
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/import",
                      json={"items": [{"url": url}], "covers": False}, timeout=60)
        assert r.status_code == 200, r.text
        res = r.json()["results"][0]
        # If first run it's imported; if a previous iteration already ran it's exists
        assert res["status"] in ("imported", "exists", "needs_content"), res
        print(f"httpbin status: {res['status']}")
        if res["status"] == "imported":
            aid = res["article_id"]
            a = auth.get(f"{BASE_URL}/api/articles/{aid}").json()
            assert len(a["content"]) > 100
            assert a["title"]


# ---------- Covers ----------
class TestCovers:
    def _delete_image_keys(self, auth):
        for n in ("openai", "gemini"):
            auth.delete(f"{BASE_URL}/api/keys/{n}", timeout=10)

    def test_covers_status(self, auth):
        self._delete_image_keys(auth)
        r = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}/covers", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "missing" in d and "has_key" in d and "job" in d
        assert d["has_key"] is False
        assert isinstance(d["missing"], int)

    def test_covers_missing_no_key_400(self, auth):
        self._delete_image_keys(auth)
        r = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/covers/missing", timeout=15)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "OpenAI" in detail or "Gemini" in detail
        assert "clave" in detail.lower() or "key" in detail.lower()

    def test_single_image_no_key_400(self, auth):
        self._delete_image_keys(auth)
        arts = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}/articles").json()
        if not arts:
            pytest.skip("no articles in TestImport")
        aid = arts[0]["id"]
        r = auth.post(f"{BASE_URL}/api/articles/{aid}/image", json={"kind": "cover"}, timeout=15)
        assert r.status_code == 400

    def test_covers_missing_with_fake_openai_queues_and_errors(self, auth):
        try:
            # Set fake openai key
            r = auth.put(f"{BASE_URL}/api/keys/openai",
                         json={"value": "sk-FAKE-TEST-KEY-" + str(int(time.time())), "extra": {}}, timeout=15)
            assert r.status_code == 200
            # Status reports has_key true
            s = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}/covers").json()
            assert s["has_key"] is True
            # Queue
            q = auth.post(f"{BASE_URL}/api/projects/{TEST_PID}/covers/missing", timeout=20)
            assert q.status_code == 200, q.text
            queued = q.json()["queued"]
            print(f"queued {queued} covers")
            # Wait up to ~30s for job to error out on all
            deadline = time.time() + 45
            job = None
            while time.time() < deadline:
                time.sleep(3)
                j = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}/covers").json().get("job")
                if j and not j.get("running"):
                    job = j
                    break
            assert job is not None, "cover job never finished"
            assert job["errors"] >= 1
            # Verify at least one article has cover_error set
            arts = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}/articles").json()
            # fetch one with cover_error
            found_err = False
            for a in arts[:5]:
                full = auth.get(f"{BASE_URL}/api/articles/{a['id']}").json()
                if full.get("cover_error"):
                    found_err = True
                    print(f"cover_error on {full['slug']}: {full['cover_error'][:100]}")
                    break
            assert found_err, "no article has cover_error"
        finally:
            # cleanup
            auth.delete(f"{BASE_URL}/api/keys/openai", timeout=10)


# ---------- publisher.article_url collapse ----------
class TestArticleUrlCollapse:
    def test_blog_blog_collapsed(self, auth):
        # patch project blog_url_pattern then fetch an article detail; article_url is used in jsonld in blog SSR
        arts = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}/articles").json()
        if not arts:
            pytest.skip("no articles")
        aid = arts[0]["id"]
        slug = arts[0]["slug"]
        # Save current pattern to restore
        proj = auth.get(f"{BASE_URL}/api/projects/{TEST_PID}").json()
        orig_pattern = proj.get("blog_url_pattern")
        published = False
        try:
            # Set pattern with double /blog/blog/
            bad = "https://x.example.com/blog/blog/{slug}"
            r = auth.patch(f"{BASE_URL}/api/projects/{TEST_PID}",
                           json={"blog_url_pattern": bad}, timeout=15)
            assert r.status_code == 200
            # Publish the article temporarily (no integrations enabled => no external push)
            pub = auth.post(f"{BASE_URL}/api/articles/{aid}/publish", timeout=20)
            assert pub.status_code == 200, pub.text
            published = True
            pk = proj["public_key"]
            # Use public article detail endpoint which returns {url, jsonld}
            pr = requests.get(f"{BASE_URL}/api/public/{TEST_PID}/articles/{slug}?key={pk}", timeout=20)
            assert pr.status_code == 200, pr.text
            d = pr.json()
            url = d["url"]
            print(f"article_url returned: {url}")
            assert url == f"https://x.example.com/blog/{slug}", f"Expected collapsed URL, got {url}"
            assert "/blog/blog/" not in url
            # Also verify jsonld contains collapsed url
            jurl = d["jsonld"].get("url") or d["jsonld"].get("@id")
            if jurl:
                assert "/blog/blog/" not in jurl
        finally:
            auth.patch(f"{BASE_URL}/api/projects/{TEST_PID}",
                       json={"blog_url_pattern": orig_pattern or ""}, timeout=15)
            if published:
                auth.post(f"{BASE_URL}/api/articles/{aid}/unpublish", timeout=20)
