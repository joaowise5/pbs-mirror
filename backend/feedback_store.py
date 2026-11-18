"""Append-only feedback storage in a JSON Lines file."""
import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from schemas import FeedbackIn, FeedbackOut

DEFAULT_PATH = Path(__file__).parent / "data" / "feedback.jsonl"


class FeedbackStore:
    def __init__(self, path: Path = DEFAULT_PATH):
        self.path = path
        self._lock = threading.Lock()

    def add(self, item: FeedbackIn) -> FeedbackOut:
        record = FeedbackOut(**item.model_dump(), id=uuid.uuid4().hex[:12], at=datetime.now(timezone.utc))
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(record.model_dump_json() + "\n")
        return record

    def all(self) -> list[FeedbackOut]:
        """Newest first."""
        if not self.path.exists():
            return []
        with self._lock:
            lines = self.path.read_text(encoding="utf-8").splitlines()
        return [FeedbackOut.model_validate_json(line) for line in reversed(lines) if line.strip()]
