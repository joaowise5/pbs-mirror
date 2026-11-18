# Offline crawl of PBS help content

The assistant should answer from a local copy of the public PBS help pages instead of fetching
them live (live `web_fetch` is slow and adds thousands of tokens per question). This document
defines what to crawl and the output format. It is implemented by
[`backend/help_crawl.py`](../../backend/help_crawl.py); the "Prompt" section below is the same
spec written as instructions, for anyone who wants to reproduce the crawl with another tool or model.

Sources come from the "Source repositories" table in the Google Doc
*PBS Passport Services Reference Report*, plus PBS Wisconsin's own pages (needed for the
station's donation threshold, which the national PBS sites don't state).

## Running the script

```bash
cd backend
pip install -r requirements.txt
python help_crawl.py            # incremental: help.pbs.org articles with an unchanged sitemap date are reused
python help_crawl.py --full     # re-fetch everything
python help_crawl.py --sources pbs_wisconsin --limit 3 -v   # quick try-out
```

Output goes to `backend/data/help_crawl/` and is committed, so every re-crawl shows up as a diff
that someone reviews before it's merged (a changed refund or eligibility rule should be seen by a person).

The script makes no LLM calls: re-crawling costs nothing, and the same page always gives the
same text and `content_hash`, which matters because answers quote pages word for word.
Upgrading `markdownify` or `beautifulsoup4` can change formatting and mark many pages as changed;
do that in its own commit.

## Re-crawling on a schedule

Run the script weekly (for example a GitLab scheduled pipeline) and open a merge request when
`changes.json` is not empty. A failed request never deletes a page we already have: the previous
copy is kept and the failure is listed in `failed.jsonl`. Only a 404/410 removes a page.

## Sources

| `source_group` | Site | What is crawled | `audience` |
| --- | --- | --- | --- |
| `station_support` | digitalsupport-stations.pbs.org | Every page under `/products/pbs-passport-for-stations/` reachable from the overview, MVault support and FAQ pages | `station_staff` |
| `viewer_help` | help.pbs.org | Every article listed in `https://help.pbs.org/support/sitemap.xml` | `viewer` |
| `contact` | help.pbs.org | The "How to contact PBS Digital Support" article | `viewer` |
| `pbs_wisconsin` | pbswisconsin.org | A fixed list: `/passport/`, `/passport-faq/`, `/support/`, `/support/individual-gifts/membership/`, `/live-tv-access-guide/`, `/tv-signal-disruptions/`, `/contact/` | `viewer` |

Out of scope: docs.pbs.org (renders in the browser; export it by hand if needed), program and
episode pages, news, events, shop and donation forms, PDFs and other attachments.

`station_support` pages are written for station staff (MVault steps). The assistant may use them
to guide Audience Services staff, but should not read them out to viewers as-is.

---

## Prompt

You are building an offline copy of public PBS help content for a retrieval-augmented support
assistant used by PBS Wisconsin Audience Services staff. Crawl the sites below, extract the
article content as clean Markdown, and write the files described in "Output". Do not chunk,
summarize, rewrite or translate the content; keep the original wording exactly, because the
assistant quotes it word for word.

### Scope

Crawl only these sources. Stay on public pages: never sign in, submit forms, or use site search.

**S1. PBS Passport for Stations** (`source_group`: `station_support`, `audience`: `station_staff`)
- Seeds: https://digitalsupport-stations.pbs.org/products/pbs-passport-for-stations/ ,
  .../pbs-passport-for-stations/mvault-support/ and .../pbs-passport-for-stations/faqs-and-troubleshooting/
- Follow links only to pages whose path starts with `/products/pbs-passport-for-stations/`.
- Content is in `#main-content .content-wrapper`. Drop the tab menu row at the top
  (OVERVIEW / MVAULT SUPPORT / FAQS AND TROUBLESHOOTING / ...). This site styles many body
  paragraphs as `<h2>`: turn "headings" longer than 100 characters into paragraphs and drop empty ones.

**S2. PBS Help Center** (`source_group`: `viewer_help`, `audience`: `viewer`)
- Take every `/support/solutions/articles/<id>-<slug>` URL from https://help.pbs.org/support/sitemap.xml
  (about 340 articles) and keep its `<lastmod>` date.
- Content is in `.article__body`; the title is `h1.article__title`; the breadcrumb is
  `ol.breadcrumbs` without "PBS Help" and "Solution home".
- The article with id 12000099002 (how to contact PBS Digital Support) gets `source_group`: `contact`.

**S3. PBS Wisconsin** (`source_group`: `pbs_wisconsin`, `audience`: `viewer`)
- Only these pages, no link following: https://pbswisconsin.org/passport/ , /passport-faq/ ,
  /support/ , /support/individual-gifts/membership/ , /live-tv-access-guide/ ,
  /tv-signal-disruptions/ , /contact/
- Content is the first of these selectors that matches: `.passportreq`, `.entry-content`,
  `main`, `article` (outermost matches only, so nested blocks aren't repeated).
- Emails on this site are hidden by Cloudflare (`data-cfemail` or `/cdn-cgi/l/email-protection#<hex>`).
  Decode them: the first byte of the hex string is an XOR key for the remaining bytes.

### Crawl rules
- Obey each site's robots.txt. If robots.txt is missing, treat the site as allowed.
- At most 1 request per second per host; retry 5xx, 429 and timeouts at most twice with backoff.
- Send the User-Agent `pbs-wisconsin-student-help-crawler/1.0`. Never put an email address
  or other personal information in it.
- Normalize URLs before de-duplicating: lowercase host, drop `www.`, `#fragment`, tracking
  query parameters (`utm_*`, `fbclid`, ...) and the trailing `/`.
- help.pbs.org publishes some articles under two ids. If two pages have the same title and the
  same `content_hash`, keep the one with the smaller `id` and list the other URL in `alt_urls`.
- Hard cap: 1,500 saved pages.

### What to extract from each page
- Keep: title, body text, headings, numbered and bulleted lists, tables (as Markdown tables),
  error messages exactly as written, and links (absolute URLs). Keep image alt text as
  `[image: alt text]`.
- Remove: scripts, styles, iframes and embedded videos, forms, buttons, site header, navigation,
  footer, sidebars, "Related articles", and feedback widgets.
- `last_updated` (`YYYY-MM-DD`): for help.pbs.org the sitemap `<lastmod>` date (fallback: the
  "Modified on:" date in the page source). Otherwise `null`. Never guess it.

### Output

Write everything into one folder:

1. `pages.jsonl`: one JSON object per page, one per line, UTF-8, sorted by `id`:

```json
{
  "id": "hp_5f2c9a1e",
  "url": "https://help.pbs.org/support/solutions/articles/12000043556-what-is-pbs-passport-",
  "alt_urls": [],
  "source_group": "viewer_help",
  "audience": "viewer",
  "site": "help.pbs.org",
  "title": "What is PBS Passport?",
  "breadcrumb": ["Most Popular", "Frequently Asked Questions"],
  "body_markdown": "PBS Passport is a member benefit ...",
  "headings": [],
  "links": ["https://help.pbs.org/support/solutions/articles/12000056932-getting-started-with-pbs-passport"],
  "last_updated": "2025-11-03",
  "fetched_at": "2026-11-09T20:15:03Z",
  "http_status": 200,
  "word_count": 412,
  "content_hash": "sha256:...",
  "sitemap_lastmod": "2025-11-03"
}
```

   - `id`: `ds_` (station support), `hp_` (help.pbs.org) or `pw_` (pbswisconsin.org) plus the
     first 8 hex characters of SHA-256 of the normalized URL. It must not change between runs.
   - `content_hash`: SHA-256 of `body_markdown` with whitespace collapsed to single spaces.
   - `headings`: heading texts without Markdown markup. `links`: absolute http(s) links in the body.
   - `sitemap_lastmod`: help.pbs.org articles only.
   - Pages with less than 40 characters of body text are not saved; list them in `failed.jsonl`.

2. `failed.jsonl`: one line per URL that could not be saved:
   `{"url": ..., "source_group": ..., "reason": "robots_disallowed | http_404 | http_503 | timeout | empty_body | parse_error: ...", "http_status": ..., "kept_previous": true}`

3. `manifest.json`:

```json
{
  "crawled_at": "2026-11-09T20:40:00Z",
  "crawler": "tool or model name and version",
  "sources": {
    "station_support": {"saved": 0, "failed": 0},
    "viewer_help": {"saved": 0, "failed": 0},
    "contact": {"saved": 0, "failed": 0},
    "pbs_wisconsin": {"saved": 0, "failed": 0}
  },
  "total_pages": 0,
  "total_words": 0,
  "estimated_tokens": 0,
  "reused_unchanged": 0,
  "duplicates_merged": 0,
  "http_requests": 0,
  "robots_skipped": []
}
```

   `estimated_tokens` = total characters of all `body_markdown` divided by 4.

4. `changes.json`: compared with the previous `pages.jsonl`, the pages that were `added`,
   `changed` (different `content_hash`) or `removed`, each as `{"id", "url", "title"}`.

### Before you finish, check
- Every line in `pages.jsonl` parses as JSON and has every field above.
- No two records share an `id` or a normalized `url`.
- Spot-check a few pages per source against the live page: same wording, no menu or footer text.
- The help.pbs.org Passport articles and the Passport for Stations MVault support and FAQ pages
  are all present. If one is missing, say why.
- Report the totals per source and `estimated_tokens` in your final message.
