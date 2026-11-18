import logging
import os
from contextlib import asynccontextmanager

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from assistant import AnswerReferenceError, Assistant, AssistantUnavailable, UpstreamError
from feedback_store import FeedbackStore
from rag import Retriever
from schemas import AskRequest, FeedbackIn, FeedbackOut, HistoryTurn
from usage_log import UsageLog

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from db.database import engine, get_db
from db import models, crud, auth
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
EFFORT = os.getenv("CLAUDE_EFFORT", "low")
PROMPT_CACHE = os.getenv("PROMPT_CACHE", "true").strip().lower() == "true"
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "6"))
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

# None if no key is set; /api/ask then answers 503 and /health reports "no_key".
_api_key = os.getenv("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=_api_key, timeout=60.0, max_retries=1) if _api_key else None

assistant: Assistant | None = None  # built at startup (see lifespan); tests set it directly
feedback_store = FeedbackStore()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global assistant
    models.Base.metadata.create_all(bind=engine)
    if assistant is None:
        assistant = Assistant(
            Retriever.load(), client, MODEL, EFFORT,
            top_k=RAG_TOP_K,
            prompt_cache=PROMPT_CACHE,
            usage_log=UsageLog(),
        )
    yield

app = FastAPI(title="PBS Wisconsin Help Assistant API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mode": "live" if assistant.client else "no_key",
        "model": MODEL,
        "sources": len(assistant.retriever.pages),
        "passages": len(assistant.retriever.passages),
    }


@app.post("/api/ask")
def ask(request: AskRequest):
    try:
        return assistant.ask(request)
    except AnswerReferenceError as exc:
        return JSONResponse(status_code=400, content={"error": "answer_not_available", "message": str(exc)})
    except AssistantUnavailable as exc:
        return JSONResponse(status_code=503, content={"error": "assistant_unavailable", "message": str(exc)})
    except UpstreamError as exc:
        return JSONResponse(status_code=502, content={"error": "upstream_error", "message": str(exc)})


@app.get("/api/sources")
def list_sources():
    """The crawled pages the assistant answers from, plus the most recent crawl date."""
    return assistant.retriever.sources()


@app.post("/api/feedback", status_code=201, response_model=FeedbackOut)
def add_feedback(item: FeedbackIn):
    return feedback_store.add(item)


@app.get("/api/feedback", response_model=list[FeedbackOut])
def list_feedback():
    return feedback_store.all()

class CreateConvoRequest(BaseModel):
    title: str = "New Chat"

@app.post("/api/conversations")
def start_conversation(
    req: CreateConvoRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    convo = crud.create_conversation(db, user_id=current_user.id, title=req.title)
    return {"id": convo.id, "title": convo.title, "created_at": convo.created_at}


@app.get("/api/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return crud.get_user_conversations(db, user_id=current_user.id)


@app.get("/api/conversations/{conversation_id}/messages")
def read_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    convo = crud.get_conversation_for_user(db, conversation_id=conversation_id, user_id=current_user.id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return crud.get_conversation_messages(db, conversation_id=conversation_id)


@app.post("/api/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    request: AskRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    convo = crud.get_conversation_for_user(db, conversation_id=conversation_id, user_id=current_user.id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not request.history:
        past_msgs = crud.get_conversation_messages(db, conversation_id=conversation_id)[-12:]
        request.history = [HistoryTurn(role=m.role, text=m.content[:4000]) for m in past_msgs]

    crud.save_message(db, conversation_id=conversation_id, role="user", content=request.question)

    try:
        result = assistant.ask(request)
    except AnswerReferenceError as exc:
        return JSONResponse(status_code=400, content={"error": "answer_not_available", "message": str(exc)})
    except AssistantUnavailable as exc:
        return JSONResponse(status_code=503, content={"error": "assistant_unavailable", "message": str(exc)})
    except UpstreamError as exc:
        return JSONResponse(status_code=502, content={"error": "upstream_error", "message": str(exc)})

    result_dict = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    summary_text = result_dict.get("summary") or result_dict.get("script") or str(result_dict)

    crud.save_message(
        db,
        conversation_id=conversation_id,
        role="assistant",
        content=summary_text,
        payload=result_dict,
    )
    return result

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@app.post("/api/register", response_model=TokenResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Restrict registration to PBS Wisconsin work emails
    if not req.email.lower().endswith("@pbswisconsin.org"):
        raise HTTPException(
            status_code=403, 
            detail="Registration is restricted to @pbswisconsin.org work emails."
        )

    if crud.get_user_by_email(db, req.email):
        raise HTTPException(status_code=400, detail="Email is already registered")
        
    user = crud.create_user(db, email=req.email, hashed_password=auth.hash_password(req.password))
    token = auth.create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)


@app.post("/api/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2PasswordRequestForm uses 'username' for the form field; we match it against email
    user = crud.get_user_by_email(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth.create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)


@app.get("/api/me")
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return {"id": current_user.id, "email": current_user.email, "created_at": current_user.created_at}

# Serve frontend static build if it exists (for single-server deployment)
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")