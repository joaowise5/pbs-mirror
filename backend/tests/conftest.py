"""Shared test helpers: a tiny page set and a word-hashing embedder, so no test downloads a model."""
import hashlib
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag import Retriever, load_passages, split_page, tokenize  # noqa: E402


class HashEmbedder:
    """Bag-of-words vectors: texts that share words point the same way. Deterministic and offline."""

    name = "test-hash-embedder"
    dims = 256

    def _vector(self, text: str) -> np.ndarray:
        v = np.zeros(self.dims, dtype=np.float32)
        for token in tokenize(text):
            v[int(hashlib.md5(token.encode()).hexdigest(), 16) % self.dims] += 1.0
        norm = np.linalg.norm(v)
        return v / norm if norm else v

    def embed_documents(self, texts):
        return np.array([self._vector(t) for t in texts])

    def embed_query(self, text):
        return self._vector(text)


def make_page(pid, title, body, site="help.pbs.org", group="viewer_help", audience="viewer",
              breadcrumb=("PBS Passport",), updated="2025-11-03"):
    return {
        "id": pid, "url": f"https://{site}/{pid}", "alt_urls": [], "source_group": group, "audience": audience,
        "site": site, "title": title, "breadcrumb": list(breadcrumb), "body_markdown": body, "headings": [],
        "links": [], "last_updated": updated, "fetched_at": "2026-11-09T22:00:00Z", "http_status": 200,
        "word_count": len(body.split()), "content_hash": "sha256:x",
    }


PAGES = [
    make_page("hp_activate", "How do I activate PBS Passport?",
              "Go to pbs.org/passport and enter the **activation code** from your email. "
              "Sign in with the PBS account you want to link. See [the guide](https://help.pbs.org/guide)."),
    make_page("hp_locked", "Why does it say this video is only available to members with Passport?",
              "You are signed in with a different PBS account than the one linked to Passport. "
              "Sign out and sign back in with the account you used at activation."),
    make_page("hp_roku", "How do I download the PBS app on Roku?",
              "Open the Roku Channel Store, search for PBS, and add the channel.", breadcrumb=("Roku",)),
    make_page("pw_faq", "Passport FAQ",
              "PBS Passport is a premium benefit available with memberships of **$60 and above**. "
              "Contact Audience Services at member@pbswisconsin.org or 1-800-422-9707.",
              site="pbswisconsin.org", group="pbs_wisconsin", breadcrumb=("PBS Wisconsin",), updated=None),
    make_page("ds_mvault", "MVault Support - PBS Passport for Stations",
              "# Change a member's Passport email\n\nOpen the member's entry in MVault and click Passport Reset. "
              "The member then reactivates with the new account.",
              site="digitalsupport-stations.pbs.org", group="station_support", audience="station_staff",
              breadcrumb=("PBS Passport for Stations", "MVault Support"), updated=None),
]


@pytest.fixture
def pages_file(tmp_path):
    import json
    path = tmp_path / "pages.jsonl"
    path.write_text("".join(json.dumps(p) + "\n" for p in PAGES))
    return path


@pytest.fixture
def retriever(pages_file):
    passages, pages = load_passages(pages_file)
    return Retriever(passages, pages, HashEmbedder(), index_dir=None)


__all__ = ["HashEmbedder", "make_page", "PAGES", "split_page"]
