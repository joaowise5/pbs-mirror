# PBS Wisconsin AI Support Assistant

---

Student Engineering Team:  
**Sarang You**, User Experience (UX)  
**Dillan Haran**, Testing Lead  
**Ian Guo**, Demo Coordinator  
**Haosen Kang**, Scribe  
**Joao Wise**, Product Owner  
**Henry Keeler**, Scrum Master  

---
---

## Project Overview

- **Partner:** PBS Wisconsin (Audience Services Team)
- **Primary Goal:** Build an AI-powered support assistant for the PBS Wisconsin Audience Service Team, to help customers with their problems and requests.

---

## Architecture / Tech Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│                    (React Interface)                        │
└──────────────────────────────┬──────────────────────────────┘
                               │  HTTP / Streaming
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Python Backend                         │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  Response Manager                   │   │
│   └──────────────┬───────────────────────▲──────────────┘   │
│                  │                       │                  │
│                  ▼                       │                  │
│   ┌────────────────────────────┐  ┌──────┴──────────────┐   │
│   │        Database Search     │  │  LLM Engine / API   │   │
│   │                            │  │ (OpenAI / Claude)   │   │
│   └────────────────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```
## Prerequisites

Before getting started, make sure you have installed the following tools locally:

- **Git:** Version control (`git --version`)
- **Python:** 3.11 or higher (`python --version` or `python3 --version`)
- **Node.js:** v18.0.0 or higher (`node --version`)
- **npm:** v9.0.0 or higher (`npm --version`)

---

## Setup & Run Instructions

### 1. Clone the Repository
```bash
git clone <https://git.doit.wisc.edu/jwise5/pbs-team-1>
cd pbs-team-1
```

### 2. Setup and run backend
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
cp .env.example .env   # then add ANTHROPIC_API_KEY
uvicorn app:app --reload --port 8000
```

### 3. Setup and run frontend

In a new terminal  
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```
Open your browser and navigate to http://localhost:5173 to access the application.
Sign in with any `@pbswisconsin.org` email and any password (login is mocked for now).

The frontend talks to the backend by default: the Vite dev server proxies `/api` and `/health`
to `http://localhost:8000` (change it with `VITE_BACKEND_URL`), so start the backend (step 2)
first. If it isn't running, the header shows the assistant as offline.

#### Demo without backend (mock mode)

Set `VITE_ASSISTANT_MODE=mock` in `frontend/.env.local` and restart `npm run dev`. Answers come
from the sample knowledge base bundled in the frontend, so step 2 is not needed.

See [`frontend/README.md`](frontend/README.md) for screens and project structure, and
[`docs/specs/`](docs/specs/) for feature specs.
