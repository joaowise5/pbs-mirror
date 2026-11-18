"""Offline crawl of public PBS help content for the assistant's local knowledge base.

A plain script on purpose: no LLM calls, so a re-crawl costs nothing and the same page always
produces the same text and content_hash (answers quote pages word for word).

Sources (see docs/crawl/crawl-prompt.md for the reasoning):
- station_support: digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/ (staff-facing)
- viewer_help:     every article in the help.pbs.org sitemap (viewer-facing)
- pbs_wisconsin:   a fixed list of pbswisconsin.org pages (Passport, membership, live TV, contact)

Usage (from backend/):
    python help_crawl.py                     # incremental: reuse help.pbs.org articles whose sitemap date is unchanged
    python help_crawl.py --full              # re-fetch everything
    python help_crawl.py --sources viewer_help --limit 20

Output (default data/help_crawl/): pages.jsonl, failed.jsonl, manifest.json, changes.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup, Comment, Tag
from markdownify import markdownify

log = logging.getLogger("help_crawl")

USER_AGENT = "pbs-wisconsin-student-help-crawler/1.0"
DEFAULT_OUT = Path(__file__).parent / "data" / "help_crawl"
DEFAULT_DELAY = 1.0  # seconds between requests to the same host
MAX_RETRIES = 2
MAX_PAGES = 1500
MIN_BODY_CHARS = 40
MAX_HEADING_CHARS = 100

HELP_SITEMAP = "https://help.pbs.org/support/sitemap.xml"
HELP_ARTICLE_RE = re.compile(r"^/support/solutions/articles/\d+")
CONTACT_ARTICLE = "/support/solutions/articles/12000099002"

STATION_PREFIX = "/products/pbs-passport-for-stations/"
STATION_SEEDS = [
    "https://digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/",
    "https://digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/mvault-support/",
    "https://digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/faqs-and-troubleshooting/",
]

# Fixed list: pbswisconsin.org is mostly programs, news and events, so we don't follow links there.
WISCONSIN_PAGES = [
    "https://pbswisconsin.org/passport/",
    "https://pbswisconsin.org/passport-faq/",
    "https://pbswisconsin.org/support/",
    "https://pbswisconsin.org/support/individual-gifts/membership/",
    "https://pbswisconsin.org/live-tv-access-guide/",
    "https://pbswisconsin.org/tv-signal-disruptions/",
    "https://pbswisconsin.org/contact/",
]

TRACKING_PARAMS = re.compile(r"^(utm_.*|fbclid|gclid|mc_cid|mc_eid|_ga)$")
STRIP_TAGS = ["script", "style", "noscript", "svg", "iframe", "form", "button", "nav", "input", "select"]


# ---------------------------------------------------------------- helpers

def normalize_url(url: str) -> str:
    """Absolute https URL without www., fragment, tracking params or trailing slash."""
    parts = urlsplit(url.strip())
    host = parts.netloc.lower().removeprefix("www.")
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not TRACKING_PARAMS.match(k)])
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(("https", host, path, query, ""))


def page_id(source_group: str, url: str) -> str:
    prefix = {"station_support": "ds", "viewer_help": "hp", "contact": "hp", "pbs_wisconsin": "pw"}[source_group]
    return f"{prefix}_{hashlib.sha256(normalize_url(url).encode()).hexdigest()[:8]}"


def content_hash(body: str) -> str:
    return "sha256:" + hashlib.sha256(re.sub(r"\s+", " ", body).strip().encode()).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def decode_cfemail(hex_string: str) -> str:
    """Cloudflare hides emails as XOR-encoded hex; the first byte is the key."""
    data = bytes.fromhex(hex_string)
    return bytes(b ^ data[0] for b in data[1:]).decode("utf-8", "replace")


def _parse_date(text: str | None) -> str | None:
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.strip().replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


MODIFIED_RE = re.compile(r"Modified on:\s*\w+,\s*(\d{1,2})\s+(\w{3})\w*,\s*(\d{4})")


def freshdesk_modified(html: str) -> str | None:
    """Freshdesk keeps 'Modified on: Mon, 3 Nov, 2025 at ...' in an HTML comment."""
    m = MODIFIED_RE.search(html)
    if not m:
        return None
    try:
        return datetime.strptime(" ".join(m.groups()), "%d %b %Y").date().isoformat()
    except ValueError:
        return None


# ---------------------------------------------------------------- HTML → Markdown

def clean_fragment(root: Tag, base_url: str) -> None:
    """Strip non-content tags and make links, images and hidden emails readable, in place."""
    for comment in root.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()
    for tag in root.find_all(STRIP_TAGS):
        tag.decompose()
    for el in root.select("[data-cfemail]"):
        email = decode_cfemail(el["data-cfemail"])
        if el.name == "a":
            el.attrs = {"href": f"mailto:{email}"}
            el.string = email
        else:
            el.replace_with(email)
    for a in root.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("/cdn-cgi/l/email-protection#"):
            email = decode_cfemail(href.split("#", 1)[1])
            a["href"], a.string = f"mailto:{email}", email
        elif not href.startswith(("mailto:", "tel:", "#", "javascript:")):
            a["href"] = urljoin(base_url, href)
    for img in root.find_all("img"):
        alt = (img.get("alt") or "").strip()
        img.replace_with(f"[image: {alt}]" if alt else "")
    # Some pages style body paragraphs as headings; keep real headings short and non-empty.
    for h in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        text = h.get_text(" ", strip=True)
        if not text:
            h.decompose()
        elif len(text) > MAX_HEADING_CHARS:
            h.name = "p"


def to_markdown(root: Tag) -> str:
    md = markdownify(str(root), heading_style="ATX", bullets="-", strip=["span", "div", "section", "article", "main"])
    md = md.replace(" ", " ")
    md = re.sub(r"[ \t]+\n", "\n", md)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip()


def link_only(el: Tag) -> bool:
    """A short block that is nothing but links (tab menus, 'back to' bars)."""
    text = el.get_text(" ", strip=True)
    if not text or len(text) > 200:
        return False
    link_text = " ".join(a.get_text(" ", strip=True) for a in el.find_all("a"))
    return len(link_text) >= 0.9 * len(text)


def markdown_links(body: str) -> list[str]:
    seen, out = set(), []
    for url in re.findall(r"\]\((https?://[^)\s]+)", body):
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def markdown_headings(body: str) -> list[str]:
    out = []
    for m in re.finditer(r"^#{1,6}\s+(.+)$", body, re.MULTILINE):
        text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", m.group(1))  # [text](url) -> text
        text = text.replace("*", "").replace("_", " ").strip()
        if text:
            out.append(text)
    return out


# ---------------------------------------------------------------- extractors

@dataclass
class Extracted:
    title: str
    body_markdown: str
    breadcrumb: list[str] = field(default_factory=list)
    last_updated: str | None = None
    links_found: list[str] = field(default_factory=list)  # raw hrefs, for discovery


def extract_help_article(html: str, url: str) -> Extracted:
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.select_one("h1.article__title") or soup.find("h1")
    body = soup.select_one(".article__body")
    if body is None:
        raise ValueError("no .article__body")
    crumbs = [li.get_text(" ", strip=True) for li in soup.select("ol.breadcrumbs li")]
    crumbs = [c for c in crumbs if c not in ("PBS Help", "Solution home")]
    clean_fragment(body, url)
    return Extracted(
        title=title_el.get_text(" ", strip=True) if title_el else "",
        body_markdown=to_markdown(body),
        breadcrumb=crumbs,
        last_updated=freshdesk_modified(html),
    )


def extract_station_page(html: str, url: str) -> Extracted:
    soup = BeautifulSoup(html, "html.parser")
    links = [a["href"] for a in soup.find_all("a", href=True)]
    root = soup.select_one("#main-content .content-wrapper") or soup.select_one("#main-content")
    if root is None:
        raise ValueError("no #main-content")
    for child in root.find_all(recursive=False):
        if link_only(child):
            child.decompose()
    title = soup.title.get_text(strip=True) if soup.title else ""
    section = title.removesuffix(" - PBS Passport for Stations").strip() or "Overview"
    clean_fragment(root, url)
    return Extracted(
        title=title,
        body_markdown=to_markdown(root),
        breadcrumb=["PBS Passport for Stations", section] if section != title else ["PBS Passport for Stations"],
        links_found=links,
    )


WISCONSIN_SELECTORS = [".passportreq", ".entry-content", "main", "article"]


def extract_wisconsin_page(html: str, url: str) -> Extracted:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["header", "footer"]):
        tag.decompose()
    for selector in WISCONSIN_SELECTORS:
        matches = [el for el in soup.select(selector) if el.get_text(strip=True)]
        # Keep outermost matches only, so nested blocks aren't written twice.
        matches = [el for el in matches
                   if not any(other is not el and any(d is el for d in other.descendants) for other in matches)]
        if matches:
            break
    else:
        raise ValueError("no content block")
    parts = []
    for el in matches:
        clean_fragment(el, url)
        parts.append(to_markdown(el))
    title = soup.title.get_text(strip=True) if soup.title else ""
    return Extracted(
        title=title.removesuffix(" - PBS Wisconsin").strip(),
        body_markdown="\n\n".join(p for p in parts if p),
        breadcrumb=["PBS Wisconsin"],
    )


def parse_sitemap(xml: str) -> list[tuple[str, str | None]]:
    """(url, lastmod date) for every help.pbs.org article in the sitemap, in sitemap order."""
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    out = []
    for url_el in ElementTree.fromstring(xml).findall("sm:url", ns):
        loc = (url_el.findtext("sm:loc", default="", namespaces=ns) or "").strip()
        if HELP_ARTICLE_RE.match(urlsplit(loc).path):
            out.append((loc, _parse_date(url_el.findtext("sm:lastmod", namespaces=ns))))
    return out


# ---------------------------------------------------------------- fetching

class FetchError(Exception):
    def __init__(self, reason: str, status: int | None = None):
        super().__init__(reason)
        self.reason, self.status = reason, status


class Fetcher:
    """Polite GET-only client: robots.txt, per-host delay, small retry with backoff."""

    def __init__(self, delay: float = DEFAULT_DELAY, client: httpx.Client | None = None):
        self.delay = delay
        self.client = client or httpx.Client(
            headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30.0
        )
        self._last: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser | None] = {}
        self.requests = 0

    def _wait(self, host: str) -> None:
        elapsed = time.monotonic() - self._last.get(host, 0.0)
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last[host] = time.monotonic()

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        if parts.netloc not in self._robots:
            parser = None
            try:
                self._wait(parts.netloc)
                self.requests += 1
                resp = self.client.get(f"{parts.scheme}://{parts.netloc}/robots.txt")
                if resp.status_code == 200 and "text/plain" in resp.headers.get("content-type", ""):
                    parser = RobotFileParser()
                    parser.parse(resp.text.splitlines())
            except httpx.HTTPError:
                pass  # no robots.txt reachable: treat as allow-all, like most crawlers
            self._robots[parts.netloc] = parser
        parser = self._robots[parts.netloc]
        return parser is None or parser.can_fetch(USER_AGENT, url)

    def get(self, url: str) -> tuple[str, str]:
        """(final_url, html). Raises FetchError."""
        if not self.allowed(url):
            raise FetchError("robots_disallowed")
        host = urlsplit(url).netloc
        for attempt in range(MAX_RETRIES + 1):
            self._wait(host)
            self.requests += 1
            try:
                resp = self.client.get(url)
            except httpx.TimeoutException:
                reason, status = "timeout", None
            except httpx.HTTPError as exc:
                reason, status = f"network_error: {type(exc).__name__}", None
            else:
                if resp.status_code == 200:
                    return str(resp.url), resp.text
                reason, status = f"http_{resp.status_code}", resp.status_code
                if resp.status_code < 500 and resp.status_code != 429:
                    raise FetchError(reason, status)
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt * self.delay)
        raise FetchError(reason, status)


# ---------------------------------------------------------------- crawl

class Crawl:
    def __init__(self, fetcher: Fetcher, previous: dict[str, dict], full: bool, limit: int | None):
        self.fetcher = fetcher
        self.previous = previous  # id -> record from the last run
        self.full = full
        self.limit = limit
        self.pages: dict[str, dict] = {}
        self.failed: list[dict] = []
        self.reused = 0
        self.robots_skipped: list[str] = []
        self.duplicates_merged = 0

    def _budget_left(self) -> bool:
        return len(self.pages) < MAX_PAGES

    def _record(self, source_group: str, audience: str, url: str, ex: Extracted, extra: dict | None = None) -> dict:
        body = ex.body_markdown
        return {
            "id": page_id(source_group, url),
            "url": url,
            "alt_urls": [],
            "source_group": source_group,
            "audience": audience,
            "site": urlsplit(url).netloc.removeprefix("www."),
            "title": ex.title,
            "breadcrumb": ex.breadcrumb,
            "body_markdown": body,
            "headings": markdown_headings(body),
            "links": markdown_links(body),
            "last_updated": ex.last_updated,
            "fetched_at": now_iso(),
            "http_status": 200,
            "word_count": len(body.split()),
            "content_hash": content_hash(body),
            **(extra or {}),
        }

    def _fail(self, url: str, source_group: str, reason: str, status: int | None) -> None:
        pid = page_id(source_group, url)
        kept = False
        # A transient error shouldn't delete a page we already have; a 404/410 means it's gone.
        if pid in self.previous and status not in (404, 410) and reason != "robots_disallowed":
            self.pages[pid] = self.previous[pid]
            kept = True
        if reason == "robots_disallowed":
            self.robots_skipped.append(url)
        self.failed.append({"url": url, "source_group": source_group, "reason": reason,
                            "http_status": status, "kept_previous": kept})
        log.warning("failed %s (%s)%s", url, reason, " - kept previous copy" if kept else "")

    def _fetch_and_store(self, url, source_group, audience, extractor, extra=None) -> Extracted | None:
        try:
            final_url, html = self.fetcher.get(url)
            ex = extractor(html, final_url)
        except FetchError as exc:
            self._fail(url, source_group, exc.reason, exc.status)
            return None
        except ValueError as exc:
            self._fail(url, source_group, f"parse_error: {exc}", 200)
            return None
        if len(ex.body_markdown) < MIN_BODY_CHARS:
            self._fail(url, source_group, "empty_body", 200)
            return None
        record = self._record(source_group, audience, url, ex, extra)
        prev = self.previous.get(record["id"])
        if prev and prev["content_hash"] == record["content_hash"]:
            record["fetched_at"] = prev["fetched_at"]  # unchanged page: keep the file diff empty
        self.pages[record["id"]] = record
        log.info("saved %s %s", record["id"], url)
        return ex

    # -- sources

    def crawl_viewer_help(self) -> None:
        try:
            _, xml = self.fetcher.get(HELP_SITEMAP)
            articles = parse_sitemap(xml)
        except (FetchError, ElementTree.ParseError) as exc:
            reason = exc.reason if isinstance(exc, FetchError) else "bad_sitemap"
            log.error("help.pbs.org sitemap unavailable (%s); keeping previous help articles", reason)
            for pid, rec in self.previous.items():
                if rec["site"] == "help.pbs.org":
                    self.pages[pid] = rec
            self.failed.append({"url": HELP_SITEMAP, "source_group": "viewer_help", "reason": reason,
                                "http_status": getattr(exc, "status", None), "kept_previous": True})
            return
        if self.limit:
            articles = articles[: self.limit]
        for url, lastmod in articles:
            if not self._budget_left():
                break
            group = "contact" if urlsplit(url).path.startswith(CONTACT_ARTICLE) else "viewer_help"
            pid = page_id(group, url)
            prev = self.previous.get(pid)
            if not self.full and prev and lastmod and prev.get("sitemap_lastmod") == lastmod:
                self.pages[pid] = {**prev, "alt_urls": []}  # merge_duplicates rebuilds alt_urls
                self.reused += 1
                continue
            ex = self._fetch_and_store(url, group, "viewer", extract_help_article, {"sitemap_lastmod": lastmod})
            if ex and lastmod:
                self.pages[pid]["last_updated"] = lastmod

    def crawl_station_support(self) -> None:
        queue = list(STATION_SEEDS)
        seen = {normalize_url(u) for u in queue}
        while queue and self._budget_left():
            if self.limit and sum(p["source_group"] == "station_support" for p in self.pages.values()) >= self.limit:
                break
            url = queue.pop(0)
            ex = self._fetch_and_store(url, "station_support", "station_staff", extract_station_page)
            for href in ex.links_found if ex else []:
                target = urljoin(url, href.strip())
                parts = urlsplit(target)
                if parts.netloc != "digitalsupport-stations.pbs.org" or not parts.path.startswith(STATION_PREFIX):
                    continue
                if re.search(r"\.(pdf|png|jpe?g|gif|zip|docx?|xlsx?|pptx?)$", parts.path, re.I):
                    continue
                key = normalize_url(target)
                if key not in seen:
                    seen.add(key)
                    queue.append(urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")))

    def crawl_pbs_wisconsin(self) -> None:
        for url in WISCONSIN_PAGES[: self.limit or None]:
            if not self._budget_left():
                break
            self._fetch_and_store(url, "pbs_wisconsin", "viewer", extract_wisconsin_page)

    def merge_duplicates(self) -> None:
        """help.pbs.org publishes some articles under two ids; keep the first, list the rest."""
        keep: dict[tuple[str, str], dict] = {}
        for pid in sorted(self.pages):
            rec = self.pages[pid]
            key = (rec["title"].strip().lower(), rec["content_hash"])
            if key in keep:
                first = keep[key]
                first["alt_urls"] = sorted(set(first["alt_urls"]) | {rec["url"], *rec["alt_urls"]})
                del self.pages[pid]
                self.duplicates_merged += 1
            else:
                keep[key] = rec


SOURCES = {
    "station_support": Crawl.crawl_station_support,
    "viewer_help": Crawl.crawl_viewer_help,
    "pbs_wisconsin": Crawl.crawl_pbs_wisconsin,
}


# ---------------------------------------------------------------- output

def load_jsonl(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    records = (json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    return {r["id"]: r for r in records}


def diff(previous: dict[str, dict], current: dict[str, dict]) -> dict:
    def ref(r):
        return {"id": r["id"], "url": r["url"], "title": r["title"]}
    return {
        "added": [ref(current[i]) for i in sorted(current.keys() - previous.keys())],
        "changed": [ref(current[i]) for i in sorted(current.keys() & previous.keys())
                    if current[i]["content_hash"] != previous[i]["content_hash"]],
        "removed": [ref(previous[i]) for i in sorted(previous.keys() - current.keys())],
    }


def write_outputs(out: Path, crawl: Crawl, previous: dict[str, dict], crawler_name: str) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    pages = dict(sorted(crawl.pages.items()))  # sorted by id so re-runs give small, readable diffs

    def write_jsonl(path: Path, rows) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
        tmp.replace(path)

    write_jsonl(out / "pages.jsonl", pages.values())
    write_jsonl(out / "failed.jsonl", crawl.failed)

    groups = ["station_support", "viewer_help", "contact", "pbs_wisconsin"]
    chars = sum(len(p["body_markdown"]) for p in pages.values())
    manifest = {
        "crawled_at": now_iso(),
        "crawler": crawler_name,
        "sources": {
            g: {"saved": sum(p["source_group"] == g for p in pages.values()),
                "failed": sum(f["source_group"] == g for f in crawl.failed)}
            for g in groups
        },
        "total_pages": len(pages),
        "total_words": sum(p["word_count"] for p in pages.values()),
        "estimated_tokens": chars // 4,
        "reused_unchanged": crawl.reused,
        "duplicates_merged": crawl.duplicates_merged,
        "http_requests": crawl.fetcher.requests,
        "robots_skipped": crawl.robots_skipped,
    }
    changes = diff(previous, pages)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (out / "changes.json").write_text(json.dumps(changes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"manifest": manifest, "changes": changes}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output folder (default: data/help_crawl)")
    parser.add_argument("--full", action="store_true", help="re-fetch pages even if the sitemap date is unchanged")
    parser.add_argument("--sources", nargs="+", choices=list(SOURCES), default=list(SOURCES))
    parser.add_argument("--limit", type=int, help="max pages per source (for trying things out)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="seconds between requests per host")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(message)s")

    previous = load_jsonl(args.out / "pages.jsonl")
    crawl = Crawl(Fetcher(delay=args.delay), previous, full=args.full, limit=args.limit)
    # Sources not crawled this run keep their previous pages.
    skipped_groups = {g for g in SOURCES if g not in args.sources} | ({"contact"} if "viewer_help" not in args.sources else set())
    crawl.pages.update({pid: r for pid, r in previous.items() if r["source_group"] in skipped_groups})
    for name in args.sources:
        SOURCES[name](crawl)
    crawl.merge_duplicates()

    result = write_outputs(args.out, crawl, previous, f"help_crawl.py ({USER_AGENT})")
    m, c = result["manifest"], result["changes"]
    print(f"{m['total_pages']} pages, ~{m['estimated_tokens']:,} tokens, {len(crawl.failed)} failed, "
          f"{m['reused_unchanged']} reused, {m['http_requests']} requests")
    print(f"changes: {len(c['added'])} added, {len(c['changed'])} changed, {len(c['removed'])} removed")
    for group, counts in m["sources"].items():
        print(f"  {group:16} saved {counts['saved']:4}  failed {counts['failed']}")
    return 0 if m["total_pages"] else 1


if __name__ == "__main__":
    sys.exit(main())
