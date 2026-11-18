"""Per-request token usage in a JSON Lines file, plus a summary report.

Run `python usage_log.py` to see how much of the prompt was served from the cache.
"""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_PATH = Path(__file__).parent / "data" / "usage.jsonl"


class UsageLog:
    def __init__(self, path: Path = DEFAULT_PATH):
        self.path = path
        self._lock = threading.Lock()

    def add(self, record: dict) -> None:
        line = json.dumps({"at": datetime.now(timezone.utc).isoformat(), **record})
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")

    def records(self) -> list[dict]:
        if not self.path.exists():
            return []
        return [json.loads(line) for line in self.path.read_text(encoding="utf-8").splitlines() if line.strip()]


def summarize(records: list[dict]) -> dict:
    total = {key: sum(r.get(key, 0) for r in records) for key in
             ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")}
    prompt = total["input_tokens"] + total["cache_creation_input_tokens"] + total["cache_read_input_tokens"]
    total["questions"] = len(records)
    total["cache_read_share"] = round(total["cache_read_input_tokens"] / prompt, 3) if prompt else 0.0
    return total


if __name__ == "__main__":
    summary = summarize(UsageLog().records())
    for key, value in summary.items():
        print(f"{key:28} {value}")
