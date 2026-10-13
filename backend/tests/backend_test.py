"""Backend regression tests for Motor SEO/AEO."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://baby-love-growth.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@motorseo.app"
ADMIN_PASSWORD = "Admin2026!"
EXISTING_PID = "2714d4205e4e450ab4a0eea09815f533"  # Huerta Viva (pre-seeded)
EXISTING_PK = "2Rd1ruZuZB7AsaqUZR8SeH41i6dbBdXV"
EXISTING_SLUG = "material-jardineria-urbana"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- Auth ----------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200

    def test_login_ok(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "admin"

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "WrongPass!!"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, auth):
        r = auth.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- API Keys ----------
class TestKeys:
    def test_list_keys(self, auth):
        r = auth.get(f"{BASE_URL}/api/keys", timeout=15)
        assert r.status_code == 200
        keys = {k["name"]: k for k in r.json()}
        for name in ("anthropic", "openai", "gemini", "perplexity", "resend"):
            assert name in keys
        assert keys["anthropic"]["configured"] is True
        assert keys["anthropic"]["masked"]

    def test_set_and_delete_gemini(self, auth):
        # Save fake gemini key
        r = auth.put(f"{BASE_URL}/api/keys/gemini", json={"value": "AIzaFAKEKEYFORTESTINGONLY123", "extra": {}}, timeout=15)
        assert r.status_code == 200
        # Verify masked
        keys = {k["name"]: k for k in auth.get(f"{BASE_URL}/api/keys").json()}
        assert keys["gemini"]["configured"] is True
        assert "*" in keys["gemini"]["masked"] or "..." in keys["gemini"]["masked"] or len(keys["gemini"]["masked"]) < 30
        # Delete
        r = auth.delete(f"{BASE_URL}/api/keys/gemini", timeout=15)
        assert r.status_code == 200
        keys = {k["name"]: k for k in auth.get(f"{BASE_URL}/api/keys").json()}
        assert keys["gemini"]["configured"] is False

    def test_anthropic_connection(self, auth):
        r = auth.post(f"{BASE_URL}/api/keys/anthropic/test", timeout=60)
        assert r.status_code == 200
        assert r.json().get("ok") is True, r.json()

    def test_unknown_key_404(self, auth):
        r = auth.put(f"{BASE_URL}/api/keys/foo", json={"value": "x", "extra": {}}, timeout=15)
        assert r.status_code == 404


# ---------- Projects ----------
class TestProjects:
    def test_list_projects(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_project(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}", timeout=15)
        assert r.status_code == 200
        p = r.json()
        assert p["id"] == EXISTING_PID
        assert p["public_key"] == EXISTING_PK

    def test_project_not_found(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/does_not_exist_x", timeout=15)
        assert r.status_code == 404

    def test_authors_and_topics_lists(self, auth):
        r1 = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/authors", timeout=15)
        r2 = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/topics", timeout=15)
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert isinstance(r1.json(), list)
        assert isinstance(r2.json(), list)
        assert len(r2.json()) >= 1

    def test_clusters(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/clusters", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Articles ----------
class TestArticles:
    def test_list_articles(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/articles", timeout=20)
        assert r.status_code == 200
        arts = r.json()
        assert isinstance(arts, list) and len(arts) >= 1
        pytest.article_id = arts[0]["id"]

    def test_get_article(self, auth):
        aid = getattr(pytest, "article_id", None)
        if not aid:
            pytest.skip("no article")
        r = auth.get(f"{BASE_URL}/api/articles/{aid}", timeout=15)
        assert r.status_code == 200
        a = r.json()
        assert a["id"] == aid
        assert "html" in a or "content_html" in a or "content" in a or a.get("title")


# ---------- Public endpoints ----------
class TestPublic:
    def test_public_articles_ok(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/articles?key={EXISTING_PK}", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_public_articles_wrong_key_403(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/articles?key=WRONGKEY", timeout=20)
        assert r.status_code == 403

    def test_public_article_detail(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/articles/{EXISTING_SLUG}?key={EXISTING_PK}", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == EXISTING_SLUG
        assert "html" in d
        assert "jsonld" in d

    def test_rss(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/rss?key={EXISTING_PK}", timeout=20)
        assert r.status_code == 200
        assert "<rss" in r.text

    def test_sitemap(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/sitemap.xml?key={EXISTING_PK}", timeout=20)
        assert r.status_code == 200
        assert "<urlset" in r.text

    def test_llms_txt(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/llms.txt", timeout=20)
        assert r.status_code == 200
        assert len(r.text) > 0

    def test_widget_js(self):
        r = requests.get(f"{BASE_URL}/api/public/{EXISTING_PID}/widget.js?key={EXISTING_PK}", timeout=20)
        assert r.status_code == 200
        assert "function" in r.text or "mseo" in r.text
        assert r.headers.get("content-type", "").startswith("application/javascript")

    def test_blog_ssr_index(self):
        r = requests.get(f"{BASE_URL}/api/blog/{EXISTING_PID}", timeout=20)
        assert r.status_code == 200
        assert "<html" in r.text.lower()

    def test_blog_ssr_article(self):
        r = requests.get(f"{BASE_URL}/api/blog/{EXISTING_PID}/{EXISTING_SLUG}", timeout=20)
        assert r.status_code == 200
        assert "<html" in r.text.lower()
        assert "application/ld+json" in r.text

    def test_track_event(self):
        r = requests.post(f"{BASE_URL}/api/public/{EXISTING_PID}/track",
                          json={"key": EXISTING_PK, "type": "list_view", "session": "testsess"}, timeout=15)
        assert r.status_code == 200

    def test_track_invalid_type(self):
        r = requests.post(f"{BASE_URL}/api/public/{EXISTING_PID}/track",
                          json={"key": EXISTING_PK, "type": "bogus", "session": "x"}, timeout=15)
        assert r.status_code == 400

    def test_lead_creation(self):
        r = requests.post(f"{BASE_URL}/api/public/{EXISTING_PID}/lead",
                          json={"key": EXISTING_PK, "email": "TEST_lead@example.com", "name": "Test User",
                                "message": "test"}, timeout=20)
        assert r.status_code == 200

    def test_lead_bad_email(self):
        r = requests.post(f"{BASE_URL}/api/public/{EXISTING_PID}/lead",
                          json={"key": EXISTING_PK, "email": "notanemail", "name": "x"}, timeout=20)
        assert r.status_code == 400


# ---------- Insights (stats, leads, visibility, audit, costs) ----------
class TestInsights:
    def test_stats(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/stats", timeout=20)
        assert r.status_code == 200

    def test_leads(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/leads", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_prompts_list(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/prompts", timeout=20)
        assert r.status_code == 200

    def test_visibility_list(self, auth):
        r = auth.get(f"{BASE_URL}/api/projects/{EXISTING_PID}/visibility", timeout=20)
        assert r.status_code == 200

    def test_costs(self, auth):
        r = auth.get(f"{BASE_URL}/api/costs", timeout=20)
        assert r.status_code == 200


# ---------- Unauth ----------
class TestUnauth:
    def test_projects_no_token(self):
        r = requests.get(f"{BASE_URL}/api/projects", timeout=15)
        assert r.status_code in (401, 403)

    def test_keys_no_token(self):
        r = requests.get(f"{BASE_URL}/api/keys", timeout=15)
        assert r.status_code in (401, 403)
