"""Request/response models for the API and the structured output we ask Claude for."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------- /api/ask ----------

class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=12)
    format: Literal["bullets", "phone_script"] = "bullets"
    answer_id: str | None = Field(default=None, alias="answerId", max_length=64)

    model_config = {"populate_by_name": True}


class PhoneScriptAnswer(BaseModel):
    """A prose rewrite of an existing, already verified answer; no new citations."""

    script: str = Field(min_length=1, max_length=4000)


class ModelAnswer(BaseModel):
    """What Claude returns. Citations are passage ids; the backend fills in the exact text and source."""

    status: Literal["answered", "chat", "no_answer"]
    tier: Literal["verified", "general"]
    is_policy: bool
    confidence: Literal["high", "medium", "none"]
    category: str
    summary: str
    steps: list[str]
    details: list[str]
    note: str
    passage_ids: list[str]
    related_passage_ids: list[str]


# ---------- /api/feedback ----------

class FeedbackIn(BaseModel):
    kind: Literal["survey", "flag", "gap", "vote"]
    by: str = Field(default="", max_length=200)
    question: str | None = Field(default=None, max_length=2000)
    answer: str | None = Field(default=None, max_length=4000)
    helpful: bool | None = None
    reason: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    category: str | None = Field(default=None, max_length=100)
    comment: str | None = Field(default=None, max_length=1000)
    conversation_id: str | None = Field(default=None, alias="conversationId", max_length=100)

    model_config = {"populate_by_name": True}


class FeedbackOut(FeedbackIn):
    id: str
    at: datetime

    model_config = {"populate_by_name": True, "serialize_by_alias": True}
