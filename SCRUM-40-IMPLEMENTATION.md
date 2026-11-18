# SCRUM-40 — Bullet-first answers with on-demand phone script

## Implemented

1. Default answer cards display the original `summary`, `steps`, and `details` as key-point bullets. The answer model's guidance now also requests concise bullet-ready fields.
2. Each successful `/api/ask` answer receives a server-generated `answerId`. **Phone script** sends a second request to the **existing** `/api/ask` endpoint with `format: "phone_script"` and that ID. The model rewrites the *original verified answer*, not a fresh search. The UI toggles between key points and a phone-ready paragraph and copies whichever format is displayed.
3. The backend returns the **exact saved citations** from the initial response. It passes the original valid passage IDs and source excerpts to the rewrite request, and never accepts newly generated source IDs. The web-fetch tool is disabled for the rewrite.
4. Both `api` and `mock` frontend modes support the button. In mock mode the paragraph is a local demonstration, without a Claude call.
5. Added backend tests for default format, KB citations, fetched web citations, response cache, invalid/expired IDs, general troubleshooting, and input validation.

## API example

```http
POST /api/ask
Content-Type: application/json

{"question": "How can I activate PBS Passport?"}
```

When the response has `status: "answered"`, use its `answerId`:

```http
POST /api/ask
Content-Type: application/json

{"question": "How can I activate PBS Passport?", "format": "phone_script", "answerId": "<answerId>"}
```

The result contains `format: "phone_script"`, `phoneScript: "..."`, and the **same** `citations` array.

## Test on your computer

Backend (Python 3.11+):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q tests
cp .env.example .env  # add your own key locally; do not commit it
uvicorn app:app --reload --port 8000
```

Frontend (new terminal):

```bash
cd frontend
npm ci
npm run build
npm run dev
```

Open `http://localhost:5173`, ask a question that produces a sourced answer, and click **Phone script**. Verify that the paragraph appears, sources remain unchanged, **Key points** restores the bullets, and **Copy** copies the displayed text plus sources. Try `VITE_ASSISTANT_MODE=mock` for an offline UI demo (set in `frontend/.env.local`).

## Limitations to review with the team

- The answer cache is in memory (30-minute TTL, up to 128 answers) and is **per backend process**. A process restart or a load-balanced request to a different process will invalidate the ID. Use a shared cache with appropriate access controls before production deployment.
- The API currently has no authentication; deploy internally only, as already noted in the project's README.
- A rewrite uses a second paid Claude call. It reuses citations, not an LLM's claim of correctness. Staff should verify policy-sensitive statements.
- The existing `.gitlab-ci.yml` installs real dependencies and executes pytest + Vite build; run it in GitLab before merging.
