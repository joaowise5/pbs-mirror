# Backend: PBS Wisconsin Help Assistant API

FastAPI service that answers Audience Services questions from the crawled PBS help pages
(retrieval + Claude), and stores staff feedback. Spec: [`docs/specs/F5b-backend-integration.md`](../docs/specs/F5b-backend-integration.md).

## Setup

```bash
cd backend
```
On MacOS / Linux
```bash
python3 -m venv venv
source venv/bin/activate
```
On Windows (Powershell)
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```
Then
```bash
pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY
python rag.py          # optional: build the passage index now (about a minute the first time)
uvicorn app:app --reload --port 8000
```

The first run downloads the embedding model (about 65 MB, into `data/.fastembed_cache/`). If you
skip `python rag.py`, the server builds the index on its first start instead.

Without `ANTHROPIC_API_KEY` the server still starts: `/health` reports `"mode": "no_key"` and
`/api/ask` returns 503, which the frontend shows as "The assistant isn't connected right now."

| Variable | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Required for answers |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Any Claude model id |
| `CLAUDE_EFFORT` | `low` | `low` / `medium` / `high`; raise if answers need more care |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | CORS allow-list, comma-separated |
| `RAG_TOP_K` | `6` | How many retrieved passages go to Claude with each question |
| `PROMPT_CACHE` | `true` | Set to `false` to turn off prompt caching |

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/health` | `{ status, mode: "live" \| "no_key", model, sources, passages }` (sources = crawled pages) |
| POST | `/api/ask` | `{ question, history?, format?: "bullets" \| "phone_script", answerId? }` → structured answer (shape in `frontend/README.md`). 400 unknown/expired script answer, 422 bad input, 503 no key, 502 upstream error |
| POST | `/api/feedback` | Store a survey / flag / content gap / helpful vote; returns 201 with the record |
| GET | `/api/feedback` | All feedback, newest first |
| GET | `/api/sources` | The crawled pages the assistant answers from (see below). Works without an API key |

`GET /api/sources` drives the frontend's Knowledge sources page:

```jsonc
{
  "lastCrawled": "2026-11-09",          // most recent crawl date across all pages
  "sources": [                          // sorted by owner, then title
    { "id": "hp_a9d46916", "title": "…", "url": "https://help.pbs.org/…", "site": "help.pbs.org",
      "owner": "PBS", "audience": "viewer" | "station_staff", "topic": "General Information",
      "breadcrumb": ["General Information", "Watching PBS"],
      "updated": "2021-12-18",          // the page's own date, null when it shows none
      "crawled": "2026-11-09",          // when the crawler saved it
      "passages": 2 }
  ]
}
```

Owner comes from the domain: `pbswisconsin.org` is **PBS Wisconsin**, any `*.pbs.org` site
(help.pbs.org, docs.pbs.org, digitalsupport-stations.pbs.org) is **PBS**. Citations from
`/api/ask` use the same owner and the same `updated` / `crawled` dates.

## Bullet-first answers and phone script (SCRUM-40)

- Ordinary questions default to `format: "bullets"`. The frontend displays summary, steps, and
  details as key-point bullets. A successful answer also includes an opaque `answerId`.
- The **Phone script** button calls the **same** `POST /api/ask` endpoint again, with
  `format: "phone_script"`, the original `question`, and that `answerId`. Example:

  ```json
  {"question": "How do I activate PBS Passport?", "format": "phone_script", "answerId": "<id from bullets>"}
  ```

- The server finds its validated original answer and sends **only that answer and its original
  source excerpts/passage IDs** to Claude for a natural-language rewrite. No fresh retrieval is done. The server attaches the **unchanged** citations and `answerId` to the
  returned `phoneScript` string. The UI can toggle back to key points without another call.
- Answer snapshots are cached **in process**, at most 128 entries for 30 minutes. An expired
  `answerId` or a mismatched question returns HTTP 400; ask the question again. In multi-worker
  or multi-instance production deployments, replace this cache with a shared, access-controlled
  store so any instance can serve the script request. Do not store untrusted client citations.
- Source reuse guarantees **citation identity**, not the factual correctness of every LLM
  paraphrase. Staff should still confirm sensitive policies before sharing.

## How answers find their sources (RAG)

Data: every `pages.jsonl` under `data/help_crawl/`: the main crawl written by `help_crawl.py` (see "Offline
copy" below) and `docs_pbs/`, the Membership Vault pages from docs.pbs.org, saved from a browser
because that site renders in JavaScript.

1. **Split** (`rag.py`): each page is cut into passages of about 200 words at headings and
   paragraph breaks (about 750 passages from 366 pages).
2. **Embed once**: every passage is turned into a vector with a small local model
   (`BAAI/bge-small-en-v1.5` via fastembed: runs on the CPU, no API key, no per-call cost).
   Vectors are cached in `data/help_index/` and rebuilt only when the pages or the model change.
3. **Search per question** (a few milliseconds): the question is embedded the same way and
   passages are ranked by cosine similarity, and separately by BM25 keyword score (good for exact
   terms such as error messages and device names). The two rankings are merged with reciprocal
   rank fusion, and the top `RAG_TOP_K` passages are kept, at most 2 from any one page. For a
   follow-up question, the previous question is added to the search so "what about Roku?" keeps its topic.
4. **Answer**: the passages go into the user turn as `<passage id="P1" ...>` blocks; the
   instructions stay in a cached system prompt. Claude returns structured output with the passage
   ids it used, and the backend fills in the exact passage text, page title, URL and dates. Ids
   Claude wasn't given are dropped, and an answer with no valid citation becomes `no_answer`.

Try retrieval on its own: `python rag.py how do I change my passport email`.

Other rules:
- Answers have a tier: `verified` (cited from a passage) or `general` (everyday troubleshooting
  such as restarting the app, labeled in the UI and never cited). Policy, billing, eligibility and
  availability questions must be verified; otherwise they become `no_answer`.
- Greetings, thanks and too-vague questions get a short `chat` reply instead of `no_answer`.
- `no_answer` lists the closest pages that retrieval found, so staff can try one of them.
- Requests opt into server-side refusal fallbacks (`fallbacks: "default"`). If every model declines,
  the API returns `no_answer`.
- `score` is `null`: cosine similarity isn't a calibrated "match %", so the UI hides it.
- PBS Passport for Stations passages are written for station staff (MVault steps); citations carry
  `audience: "station_staff"` so the UI can tell them apart.

Feedback is appended to `data/feedback.jsonl` (git-ignored). The API has no authentication yet:
run it locally or on an internal network only.

## Token usage

Each question logs its token usage (including `cache_creation_input_tokens` and
`cache_read_input_tokens`) to the console and to `data/usage.jsonl` (git-ignored). For a summary,
including the share of prompt tokens served from the cache:

```bash
python usage_log.py
```

## Offline copy of the PBS help pages

`help_crawl.py` saves the public PBS help content (help.pbs.org articles, the PBS Passport for
Stations pages, and key pbswisconsin.org pages) to `data/help_crawl/` as Markdown, one JSON record
per page. It is a plain script with no Claude calls, so re-crawling is free and repeatable.

```bash
python help_crawl.py          # incremental re-crawl (unchanged help.pbs.org articles are reused)
python help_crawl.py --full   # re-fetch everything
```

Each run also writes `manifest.json` (counts and an estimated token total) and `changes.json`
(pages added, changed or removed since the last run). After a re-crawl, run `python rag.py` (or
restart the API) to rebuild the passage index. Scope and format: [`docs/crawl/crawl-prompt.md`](../docs/crawl/crawl-prompt.md).

## Tests

```bash
pytest -q tests
```

Tests use a fake Claude client and never call the API.
