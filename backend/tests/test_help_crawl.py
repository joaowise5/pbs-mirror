"""Crawler tests with canned HTML and a fake HTTP transport; nothing here touches the network."""
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import help_crawl as hc  # noqa: E402

ARTICLE_HTML = """<html><head><title>What is PBS Passport? : PBS Help</title></head><body>
<ol class="breadcrumbs"><li><a href="/support/home">PBS Help</a></li>
<li><a href="/support/solutions">Solution home</a></li>
<li><a href="/support/solutions/5000121793">PBS Passport</a></li>
<li><a href="/support/solutions/folders/1">General Information</a></li></ol>
<article><h1 class="article__title">What is PBS Passport?</h1>
<div class="article__body markdown">
<p><iframe src="https://www.youtube.com/embed/x"></iframe></p>
<p>PBS Passport is a member benefit. <a href="/support/solutions/articles/2-activate">Activate it</a>.</p>
<h2>Steps</h2><ol><li>Donate</li><li>Activate</li></ol>
<table><tr><th>Field</th><th>Needs</th></tr><tr><td>Status</td><td>On</td></tr></table>
<script>track()</script>
</div></article>
<div class="related-articles">Related: How do I cancel?</div>
<!-- Modified on: Mon, 3 Nov, 2025 at 11:23 AM -->
</body></html>"""

STATION_HTML = """<html><head><title>MVault Support - PBS Passport for Stations</title></head><body>
<nav>Site menu</nav>
<div id="main-content"><div class="container"><div class="content-wrapper">
<div class="row-fluid"><a href="/products/pbs-passport-for-stations/">OVERVIEW</a>
<a href="/products/pbs-passport-for-stations/faqs-and-troubleshooting/">FAQS</a></div>
<div class="row-fluid"><h2>The Membership Vault console, or MVault, is a vital tool in helping your members with their
PBS Passport benefits and all station staff should request access.</h2>
<h1><strong>The MVault Entry</strong></h1><h6> </h6>
<p>Each entry represents one member. Contact <a href="/cdn-cgi/l/email-protection#c9aaa6a4a4aca7bdba89b9abbabea0baaaa6a7baa0a7e7a6bbae">[email&#160;protected]</a>.</p>
<a href="/products/pbs-passport-for-stations/video-guides/">Video guides</a>
<a href="/products/other-product/">Other product</a>
</div></div></div></div></body></html>"""

WISCONSIN_HTML = """<html><head><title>Passport FAQ - PBS Wisconsin</title></head><body>
<header>Top menu</header>
<div class="row passportreq"><p>Passport comes with memberships of <strong>$60 and above</strong>.</p>
<div class="entry-content"><h4>How do I activate?</h4><p>Enter your code.</p></div></div>
<footer>Footer links</footer></body></html>"""


def test_normalize_url_and_stable_id():
    a = hc.normalize_url("https://WWW.Example.org/a/b/?utm_source=x&q=1#top")
    assert a == "https://example.org/a/b?q=1"
    assert hc.page_id("viewer_help", "https://help.pbs.org/x/") == hc.page_id("viewer_help", "https://help.pbs.org/x")
    assert hc.page_id("viewer_help", "https://help.pbs.org/x").startswith("hp_")


def test_decode_cfemail():
    assert hc.decode_cfemail("c9aaa6a4a4aca7bdba89b9abbabea0baaaa6a7baa0a7e7a6bbae") == "comments@pbswisconsin.org"


def test_help_article_extraction():
    ex = hc.extract_help_article(ARTICLE_HTML, "https://help.pbs.org/support/solutions/articles/1-what")
    assert ex.title == "What is PBS Passport?"
    assert ex.breadcrumb == ["PBS Passport", "General Information"]
    assert ex.last_updated == "2025-11-03"
    body = ex.body_markdown
    assert "PBS Passport is a member benefit." in body
    assert "(https://help.pbs.org/support/solutions/articles/2-activate)" in body  # absolute link
    assert "## Steps" in body and "1. Donate" in body
    assert "| Status | On |" in body
    assert "track()" not in body and "youtube" not in body and "Related" not in body


def test_station_extraction_cleans_menus_headings_and_emails():
    url = "https://digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/mvault-support/"
    ex = hc.extract_station_page(STATION_HTML, url)
    body = ex.body_markdown
    assert ex.breadcrumb == ["PBS Passport for Stations", "MVault Support"]
    assert "OVERVIEW" not in body  # tab menu removed
    assert "Site menu" not in body
    assert "comments@pbswisconsin.org" in body and "email protected" not in body
    assert hc.markdown_headings(body) == ["The MVault Entry"]  # long "heading" became a paragraph, empty one dropped
    assert "######" not in body
    assert any(h.endswith("/video-guides/") for h in ex.links_found)


def test_wisconsin_extraction_keeps_outer_block_once():
    ex = hc.extract_wisconsin_page(WISCONSIN_HTML, "https://pbswisconsin.org/passport-faq/")
    assert ex.title == "Passport FAQ"
    assert ex.body_markdown.count("Enter your code.") == 1
    assert "$60 and above" in ex.body_markdown
    assert "Top menu" not in ex.body_markdown and "Footer" not in ex.body_markdown


def test_parse_sitemap_keeps_articles_only():
    xml = """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://help.pbs.org/support/solutions/5000121793</loc><lastmod>2026-11-01T08:00:46+00:00</lastmod></url>
    <url><loc>https://help.pbs.org/support/solutions/articles/1-what</loc><lastmod>2025-11-03T21:53:38+05:30</lastmod></url>
    </urlset>"""
    assert hc.parse_sitemap(xml) == [("https://help.pbs.org/support/solutions/articles/1-what", "2025-11-03")]


# ---------------------------------------------------------------- end to end with a fake transport

SITEMAP = """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://help.pbs.org/support/solutions/articles/1-what</loc><lastmod>2025-11-03T00:00:00+00:00</lastmod></url>
<url><loc>https://help.pbs.org/support/solutions/articles/9-what-copy</loc><lastmod>2025-11-03T00:00:00+00:00</lastmod></url>
<url><loc>https://help.pbs.org/support/solutions/articles/12000099002-how-to-contact</loc><lastmod>2025-01-01T00:00:00+00:00</lastmod></url>
</urlset>"""
CONTACT_HTML = ARTICLE_HTML.replace("What is PBS Passport?", "How to contact PBS Digital Support").replace(
    "PBS Passport is a member benefit.", "Email help@pbs.org.")


def fake_client(routes: dict, hits: list) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        hits.append(url)
        if url.endswith("/robots.txt"):
            if "help.pbs.org" in url:
                return httpx.Response(200, text="User-agent: *\nDisallow: /support/search\n",
                                      headers={"content-type": "text/plain"})
            return httpx.Response(404, text="<html>404</html>", headers={"content-type": "text/html"})
        if url in routes:
            return httpx.Response(200, text=routes[url], headers={"content-type": "text/html"})
        return httpx.Response(404, text="not found")
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)


def run(tmp_path, routes, args, hits):
    original = hc.Fetcher.__init__

    def init(self, delay=0, client=None):
        original(self, delay=0, client=fake_client(routes, hits))
    hc.Fetcher.__init__ = init
    try:
        code = hc.main(["--out", str(tmp_path), *args])
    finally:
        hc.Fetcher.__init__ = original
    pages = hc.load_jsonl(tmp_path / "pages.jsonl")
    return code, pages, json.loads((tmp_path / "changes.json").read_text())


def test_end_to_end_dedupe_contact_and_incremental(tmp_path):
    routes = {
        hc.HELP_SITEMAP: SITEMAP,
        "https://help.pbs.org/support/solutions/articles/1-what": ARTICLE_HTML,
        "https://help.pbs.org/support/solutions/articles/9-what-copy": ARTICLE_HTML,
        "https://help.pbs.org/support/solutions/articles/12000099002-how-to-contact": CONTACT_HTML,
        hc.STATION_SEEDS[1]: STATION_HTML,
        "https://digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/video-guides/": STATION_HTML.replace(
            "MVault Support", "Video Guides"),
        hc.WISCONSIN_PAGES[1]: WISCONSIN_HTML,
    }
    hits = []
    code, pages, changes = run(tmp_path, routes, [], hits)
    assert code == 0
    groups = sorted(p["source_group"] for p in pages.values())
    # 3 help articles -> 2 after merging the duplicate (one is the contact page); 2 station pages
    # (2 of the 3 seeds return 404, video-guides is found by following a link); 1 Wisconsin page.
    assert groups.count("viewer_help") == 1 and groups.count("contact") == 1
    assert groups.count("station_support") == 2 and groups.count("pbs_wisconsin") == 1
    merged = next(p for p in pages.values() if p["title"] == "What is PBS Passport?")
    assert len(merged["alt_urls"]) == 1
    assert merged["last_updated"] == "2025-11-03"
    for p in pages.values():
        assert p["body_markdown"] and p["content_hash"].startswith("sha256:")
    assert len(changes["added"]) == len(pages)
    assert not any("other-product" in h for h in hits)  # stayed inside the Passport for Stations section
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["total_pages"] == len(pages) and manifest["estimated_tokens"] > 0

    # Second run: unchanged sitemap dates reuse help articles; a changed Wisconsin page shows up in changes.
    routes[hc.WISCONSIN_PAGES[1]] = WISCONSIN_HTML.replace("Enter your code.", "Enter your new code.")
    hits.clear()
    code, pages2, changes2 = run(tmp_path, routes, [], hits)
    assert "https://help.pbs.org/support/solutions/articles/1-what" not in hits
    assert set(pages2) == set(pages)
    assert [c["url"] for c in changes2["changed"]] == [hc.WISCONSIN_PAGES[1]]
    assert changes2["added"] == [] and changes2["removed"] == []


def test_transient_failure_keeps_previous_copy_but_404_removes(tmp_path):
    routes = {hc.HELP_SITEMAP: SITEMAP.split("<url><loc>https://help.pbs.org/support/solutions/articles/9")[0] + "</urlset>",
              "https://help.pbs.org/support/solutions/articles/1-what": ARTICLE_HTML,
              hc.WISCONSIN_PAGES[1]: WISCONSIN_HTML}
    _, pages, _ = run(tmp_path, routes, ["--sources", "viewer_help", "pbs_wisconsin"], [])
    assert len(pages) == 2

    def broken(request):
        url = str(request.url)
        if url == hc.WISCONSIN_PAGES[1]:
            return httpx.Response(503)
        if url == "https://help.pbs.org/support/solutions/articles/1-what":
            return httpx.Response(404)
        if url == hc.HELP_SITEMAP:
            return httpx.Response(200, text=routes[hc.HELP_SITEMAP].replace("2025-11-03", "2025-12-01"))
        return httpx.Response(404)

    original = hc.Fetcher.__init__
    hc.Fetcher.__init__ = lambda self, delay=0, client=None: original(
        self, delay=0, client=httpx.Client(transport=httpx.MockTransport(broken)))
    try:
        hc.main(["--out", str(tmp_path), "--sources", "viewer_help", "pbs_wisconsin"])
    finally:
        hc.Fetcher.__init__ = original
    pages2 = hc.load_jsonl(tmp_path / "pages.jsonl")
    changes = json.loads((tmp_path / "changes.json").read_text())
    assert [p["source_group"] for p in pages2.values()] == ["pbs_wisconsin"]  # 503: kept; 404: removed
    assert [c["url"] for c in changes["removed"]] == ["https://help.pbs.org/support/solutions/articles/1-what"]
    failed = [json.loads(line) for line in (tmp_path / "failed.jsonl").read_text().splitlines()]
    assert {f["reason"] for f in failed} == {"http_503", "http_404"}
