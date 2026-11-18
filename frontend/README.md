# Frontend: PBS Wisconsin Help Assistant

The internal AI help assistant for PBS Wisconsin's Audience Services team, built with
**React 18** and **Vite 5**. Staff ask the questions viewers are calling or emailing about
(PBS Passport, live TV, devices, accounts) and get short, **sourced** answers.

Design reference: Figma Make "PBS Chatbot". Feature specs live in [`docs/specs/`](../docs/specs/).

## Run it

```bash
cd frontend
npm install
cp .env.example .env.local   # optional, see "Modes" below
npm run dev
```

Open http://localhost:5173. Sign in with any `@pbswisconsin.org` email and any password
(login is mocked until SSO is connected).

## Modes

`VITE_ASSISTANT_MODE` in `.env.local` picks where answers come from:

| Mode | What it does | Needs backend |
| --- | --- | --- |
| `api` (default) | Calls the FastAPI backend. In dev, Vite proxies `/api` and `/health` to `VITE_BACKEND_URL` (default `http://localhost:8000`) | Yes |
| `mock` | Keyword retriever over the sample knowledge base in `src/data/knowledgeBase.js` | No |

Set `VITE_API_BASE_URL` only to call a backend directly instead of through the dev proxy
(for example a deployed build); its `ALLOWED_ORIGINS` must then include the frontend's origin.

The header shows a "Sample data" badge in `mock` mode. The sample content is placeholder
text, **not verified PBS policy**.

Questions to try:

- `Member activated Passport but videos are still locked` → verified answer
- `can my wife use my passport` → partial match ("verify before sharing")
- `Can I get a refund on my tote bag?` → safe fail-state

## Screens

| Screen | What it shows |
| --- | --- |
| **Loading** | Shown on first load while the session is restored and the backend health check runs. |
| **Login** | Staff-only sign-in (email domain check, empty-field error, forgot password, help popover). |
| **Help Assistant** | Header with knowledge base status, navy sidebar, quick-prompt cards, and bullet-first answers with a confidence badge, inline citations, and source chips. **Phone script** toggles to an on-demand paragraph from the same citations. Copy, **Copy as email reply**, thumbs up/down, and **Flag**. |
| **Safe fail-state** | Low-confidence questions get "No verified answer" instead of a guess, plus next steps, the closest known topics, and **Log as content gap**. |
| **Source drawer** | Click any citation to see the exact passage the answer came from, plus owner and dates. In `api` mode it shows the page's last-updated date, when it was crawled, its section, and "Open original page". |
| **Share feedback** | Overall rating (1–5), category, and comments. |
| **Team FAQ** | `mock` mode only: searchable, filterable FAQ from the sample knowledge base. Hidden in `api` mode until the team decides whether to remove it or turn it into a list of crawled help articles by topic. |
| **Knowledge sources** | `api` mode: the crawled PBS help pages from `GET /api/sources`, searchable and grouped by owner, with the last crawl date. `mock` mode: the sample sources with "review due" flags and simulated re-sync. Both show the feedback queue (flags, content gaps, surveys). |
| **Staff handbook / Escalation directory** | Placeholders until those resources are connected. |

## Project structure

```
src/
  App.jsx                    Boot (loading screen) and auth gate
  styles.css                 All styles (brand tokens at the top)
  components/
    LoadingScreen.jsx        Startup screen
    LoginScreen.jsx          Staff sign-in
    AppShell.jsx             Layout + app state (conversations, feedback, drawer, toast)
    AppHeader.jsx            Logo, knowledge base status, user, sign out
    Sidebar.jsx              Workspace, recent conversations, resources, help card
    AssistantView.jsx        Quick prompts, thread, composer
    Message.jsx              Answer card, fail-state card, flag form
    FeedbackView.jsx         Share feedback page
    FaqView.jsx              Team FAQ
    SourcesView.jsx          Knowledge sources + feedback queue
    SourceDrawer.jsx         Citation / source details panel
    PlaceholderView.jsx      Resources that aren't connected yet
    Icons.jsx                Inline SVG icons + placeholder logo
  data/knowledgeBase.js      SAMPLE sources + FAQ/answer entries (mock mode)
  services/assistant.js      Picks mock or api by VITE_ASSISTANT_MODE
  services/assistant.mock.js Keyword retriever over the sample knowledge base
  services/assistant.api.js  FastAPI backend client
  services/auth.js           MOCK auth → swap for SSO
  lib/                       Formatting helpers, view config
```

## Assistant response shape

`assistant.ask(question, { onStatus, history, format, answerId })` resolves to one of.
`format` defaults to `"bullets"`. A second call with `format: "phone_script"` and the original
`answerId` returns `phoneScript` as a paragraph, retaining the exact original `citations`:


```jsonc
// Answered
{
  "status": "answered",
  "format": "bullets",             // or "phone_script" on the second call
  "answerId": "opaque-server-id",  // use this in the phone_script request
  "phoneScript": "…",               // only present for "phone_script" responses
  "tier": "verified" | "general",    // general = uncited troubleshooting, labeled in the UI
  "confidence": "high" | "medium",   // medium shows "verify before sharing"
  "score": 0.86,                     // 0–1 retrieval match, or null when unknown
  "category": "PBS Passport",
  "summary": "One- or two-sentence answer.",
  "steps": ["…"],                    // ordered steps (can be empty)
  "details": ["…"],                  // bullets (can be empty)
  "note": "…",                       // optional caution
  "citations": [
    // Mock mode: a source from the sample knowledge base
    { "sourceId": "S1", "title": "…", "type": "Web|PDF|Doc", "origin": "…", "url": "https://…",  // url optional
      "owner": "…", "updated": "YYYY-MM-DD", "chunks": 48, "excerpt": "exact retrieved passage" },
    // API mode: a passage retrieved from the crawled PBS help pages
    { "sourceId": "P1", "id": "hp_5f2c9a1e", "title": "…", "type": "Web", "origin": "help.pbs.org",
      "url": "https://help.pbs.org/…", "owner": "PBS" | "PBS Wisconsin",
      "updated": "YYYY-MM-DD" | null,  // the page's own date, null when it shows none
      "crawled": "YYYY-MM-DD",         // when the crawler saved the page
      "chunks": 3, "section": "…", "audience": "viewer" | "station_staff", "excerpt": "exact passage text" }
  ],  // empty for tier "general"
  "related": [{ "id": "…", "question": "…" }]   // API mode: other pages, "question" is the page title
}

// Greeting, small talk, or a clarifying question
{ "status": "chat", "message": "Hi! Ask me about PBS Passport, devices, live TV, or member accounts." }

// Refused (safe fail-state)
{ "status": "no_answer", "score": 0.12, "closest": [{ "id": "…", "question": "…" }] }
```

`onStatus(text)` is optional and shows progress while the answer is prepared.
`health()` resolves to `{ ok: boolean }` and drives the header status.
In `api` mode, `sourcesApi.list()` (`services/assistant.api.js`) loads `GET /api/sources` for the
Knowledge sources page and the "Grounded in N indexed sources" line; the shape is in `backend/README.md`.

## Notes

- The logo mark is a placeholder. Use the official PBS Wisconsin logo files from the brand team.
- `auth.js` is mocked with `sessionStorage`. Replace `signIn`, `signOut`, and `currentUser` with PBS Wisconsin's SSO flow.
- Font: Inter (Google Fonts), falling back to system fonts.
- Responsive down to phone width; respects `prefers-reduced-motion`.
