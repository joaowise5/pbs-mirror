"""Local retrieval over the crawled PBS help pages (every pages.jsonl under data/help_crawl/).

Pipeline:
1. Split each page into passages of about 200 words, cut at headings and paragraph breaks.
2. Embed every passage once with a small local model (fastembed, BAAI/bge-small-en-v1.5) and
   cache the vectors in data/help_index/; they are rebuilt only when the pages or the model change.
3. For a question: embed it, rank passages by cosine similarity, rank them again with BM25
   keyword scoring, and merge the two rankings (reciprocal rank fusion). Keyword matching catches
   exact terms such as error messages and device names that embeddings can blur.
4. The top few passages go to Claude; the rest of the index never enters the prompt.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

log = logging.getLogger("pbs.rag")

DATA_DIR = Path(__file__).parent / "data"
DEFAULT_PAGES = DATA_DIR / "help_crawl"  # every pages.jsonl under this folder
DEFAULT_INDEX_DIR = DATA_DIR / "help_index"
DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"

MAX_WORDS = 220   # passage size target
MIN_WORDS = 60    # a heading only starts a new passage once the current one has this many words
RRF_K = 60        # reciprocal rank fusion constant (standard value)
CANDIDATES = 50   # how many results from each ranking are fused

def owner_for(site: str) -> str:
    """Who owns a crawled page, from its domain: pbswisconsin.org is PBS Wisconsin, any pbs.org site is PBS."""
    host = site.lower().removeprefix("www.")
    if host == "pbswisconsin.org" or host.endswith(".pbswisconsin.org"):
        return "PBS Wisconsin"
    if host == "pbs.org" or host.endswith(".pbs.org"):
        return "PBS"
    return host

STOPWORDS = set("""a an and are as at be but by can do does for from how i if in is it its me my of on or our
so that the their them then there they this to was we what when where which who why will with you your""".split())


# ---------------------------------------------------------------- passages

@dataclass(frozen=True)
class Passage:
    id: str            # stable: "<page id>#<n>"
    page_id: str
    url: str
    title: str
    site: str
    source_group: str
    audience: str
    breadcrumb: tuple[str, ...]
    section: str
    text: str          # Markdown, as written on the page
    updated: str | None
    fetched: str | None

    @property
    def search_text(self) -> str:
        """What gets embedded and keyword-indexed: the passage plus where it sits on the site."""
        context = " > ".join(p for p in (*self.breadcrumb, self.title, self.section) if p)
        return f"{context}\n{self.text}"


def _heading_text(line: str) -> str:
    text = re.sub(r"^#{1,6}\s+", "", line)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    return text.replace("*", "").strip()


def split_page(page: dict) -> list[Passage]:
    """Cut a page into passages of at most ~MAX_WORDS words at headings and paragraph breaks."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", page["body_markdown"]) if b.strip()]
    chunks: list[tuple[str, list[str]]] = []  # (section, blocks)
    section, current, words = "", [], 0

    def flush():
        nonlocal current, words
        if current:
            chunks.append((section_of_chunk, current))
        current, words = [], 0

    section_of_chunk = ""
    for block in blocks:
        is_heading = bool(re.match(r"^#{1,6}\s", block))
        size = len(block.split())
        if is_heading:
            section = _heading_text(block.splitlines()[0])
            if words >= MIN_WORDS:
                flush()
        if current and words + size > MAX_WORDS:
            flush()
        if not current:
            section_of_chunk = section
        if size > MAX_WORDS:  # one very long paragraph: split it by sentences
            for piece in _split_long(block):
                if current and words + len(piece.split()) > MAX_WORDS:
                    flush()
                    section_of_chunk = section
                current.append(piece)
                words += len(piece.split())
            continue
        current.append(block)
        words += size
    flush()

    # A short trailing passage is merged into the one before it.
    if len(chunks) > 1 and sum(len(b.split()) for b in chunks[-1][1]) < MIN_WORDS // 2:
        last = chunks.pop()
        chunks[-1] = (chunks[-1][0], chunks[-1][1] + last[1])

    return [
        Passage(
            id=f"{page['id']}#{i}",
            page_id=page["id"],
            url=page["url"],
            title=page["title"],
            site=page["site"],
            source_group=page["source_group"],
            audience=page["audience"],
            breadcrumb=tuple(page.get("breadcrumb") or ()),
            section=sec,
            text="\n\n".join(parts),
            updated=page.get("last_updated"),
            fetched=(page.get("fetched_at") or "")[:10] or None,
        )
        for i, (sec, parts) in enumerate(chunks)
    ]


def _split_long(block: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", block)
    out, current = [], []
    for s in sentences:
        if current and len(" ".join(current + [s]).split()) > MAX_WORDS:
            out.append(" ".join(current))
            current = []
        current.append(s)
    if current:
        out.append(" ".join(current))
    return out


def page_files(path: Path) -> list[Path]:
    """A pages.jsonl file, or every pages.jsonl under a folder (help_crawl/ plus e.g. help_crawl/docs_pbs/)."""
    if not path.is_dir():
        return [path]
    return sorted(path.rglob("pages.jsonl"), key=lambda f: (len(f.parts), str(f)))  # top-level crawl first


def load_passages(pages_path: Path = DEFAULT_PAGES) -> tuple[list[Passage], dict[str, dict]]:
    pages: dict[str, dict] = {}
    for file in page_files(pages_path):
        for line in file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                page = json.loads(line)
                pages.setdefault(page["id"], page)  # first file wins if two crawls saved the same page
    passages = [p for page in pages.values() for p in split_page(page)]
    return passages, pages


# ---------------------------------------------------------------- embeddings

class Embedder(Protocol):
    name: str

    def embed_documents(self, texts: list[str]) -> np.ndarray: ...

    def embed_query(self, text: str) -> np.ndarray: ...


class FastEmbedder:
    """Local ONNX embedding model. Downloads once (~65 MB) into data/.fastembed_cache."""

    def __init__(self, model: str = DEFAULT_MODEL, cache_dir: Path = DATA_DIR / ".fastembed_cache"):
        from fastembed import TextEmbedding  # imported here so tests don't need the model

        self.name = model
        self._model = TextEmbedding(model, cache_dir=str(cache_dir))

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        # Small batches are faster here: passages vary in length and each batch pads to its longest one.
        return _normalize(np.array(list(self._model.passage_embed(texts, batch_size=16)), dtype=np.float32))

    def embed_query(self, text: str) -> np.ndarray:
        return _normalize(np.array(list(self._model.query_embed(text)), dtype=np.float32))[0]


def _normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


# ---------------------------------------------------------------- BM25

def tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOPWORDS]


class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.tfs = [Counter(d) for d in docs]
        self.lengths = np.array([len(d) for d in docs], dtype=np.float32)
        self.avg = float(self.lengths.mean()) if docs else 0.0
        df = Counter(term for d in docs for term in set(d))
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def scores(self, query: list[str]) -> np.ndarray:
        out = np.zeros(len(self.tfs), dtype=np.float32)
        for term in set(query):
            idf = self.idf.get(term)
            if idf is None:
                continue
            for i, tf in enumerate(self.tfs):
                f = tf.get(term)
                if f:
                    denom = f + self.k1 * (1 - self.b + self.b * self.lengths[i] / self.avg)
                    out[i] += idf * f * (self.k1 + 1) / denom
        return out


# ---------------------------------------------------------------- retriever

@dataclass(frozen=True)
class Hit:
    passage: Passage
    similarity: float   # cosine similarity of the question and the passage, 0..1 in practice
    score: float        # fused rank score used for ordering


class Retriever:
    def __init__(self, passages: list[Passage], pages: dict[str, dict], embedder: Embedder,
                 index_dir: Path | None = DEFAULT_INDEX_DIR):
        if not passages:
            raise ValueError("no passages to index")
        self.passages = passages
        self.pages = pages
        self.embedder = embedder
        self.by_id = {p.id: p for p in passages}
        self.passages_per_page = Counter(p.page_id for p in passages)
        self.vectors = self._vectors(index_dir)
        self.bm25 = BM25([tokenize(p.search_text) for p in passages])

    @classmethod
    def load(cls, pages_path: Path = DEFAULT_PAGES, embedder: Embedder | None = None,
             index_dir: Path | None = DEFAULT_INDEX_DIR) -> "Retriever":
        passages, pages = load_passages(pages_path)
        return cls(passages, pages, embedder or FastEmbedder(), index_dir)

    def _vectors(self, index_dir: Path | None) -> np.ndarray:
        texts = [p.search_text for p in self.passages]
        fingerprint = hashlib.sha256(
            "\x00".join([self.embedder.name, *[p.id for p in self.passages], *texts]).encode()
        ).hexdigest()
        if index_dir:
            meta_path, vec_path = index_dir / "meta.json", index_dir / "vectors.npy"
            if meta_path.exists() and vec_path.exists():
                meta = json.loads(meta_path.read_text())
                if meta.get("fingerprint") == fingerprint:
                    return np.load(vec_path)
        log.info("embedding %d passages with %s", len(texts), self.embedder.name)
        vectors = self.embedder.embed_documents(texts)
        if index_dir:
            index_dir.mkdir(parents=True, exist_ok=True)
            np.save(vec_path, vectors)
            meta_path.write_text(json.dumps({"fingerprint": fingerprint, "model": self.embedder.name,
                                             "passages": len(texts)}, indent=2))
        return vectors

    def search(self, query: str, k: int = 6, per_page: int = 2) -> list[Hit]:
        """Top k passages for the query, at most per_page from any one page."""
        similarity = self.vectors @ self.embedder.embed_query(query)
        keyword = self.bm25.scores(tokenize(query))

        by_meaning = np.argsort(-similarity)[:CANDIDATES]
        by_keyword = [i for i in np.argsort(-keyword)[:CANDIDATES] if keyword[i] > 0]  # real matches only
        fused = np.zeros(len(self.passages), dtype=np.float32)
        for ranking in (by_meaning, by_keyword):
            for rank, i in enumerate(ranking):
                fused[i] += 1.0 / (RRF_K + rank + 1)

        hits, taken = [], Counter()
        for i in np.argsort(-fused):
            if fused[i] <= 0 or len(hits) >= k:
                break
            p = self.passages[i]
            if taken[p.page_id] >= per_page:
                continue
            taken[p.page_id] += 1
            hits.append(Hit(p, float(similarity[i]), float(fused[i])))
        return hits

    def owner(self, passage: Passage) -> str:
        return owner_for(passage.site)

    def sources(self) -> dict:
        """Every indexed page with its owner and passage count, for the Knowledge sources page."""
        items = []
        for page in self.pages.values():
            if not self.passages_per_page[page["id"]]:
                continue  # a page with no text has nothing the assistant can cite
            items.append({
                "id": page["id"],
                "title": page["title"],
                "url": page["url"],
                "site": page["site"],
                "owner": owner_for(page["site"]),
                "audience": page["audience"],
                "topic": (page.get("breadcrumb") or [""])[0],
                "breadcrumb": page.get("breadcrumb") or [],
                "updated": page.get("last_updated"),
                "crawled": (page.get("fetched_at") or "")[:10] or None,
                "passages": self.passages_per_page[page["id"]],
            })
        items.sort(key=lambda s: (s["owner"], s["title"].lower()))
        crawled = [s["crawled"] for s in items if s["crawled"]]
        return {"lastCrawled": max(crawled) if crawled else None, "sources": items}


if __name__ == "__main__":
    # Build (or refresh) the passage index ahead of time, e.g. right after running help_crawl.py,
    # so the API starts without embedding everything. Optional: try a question.
    import sys
    import time

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    started = time.perf_counter()
    retriever = Retriever.load()
    print(f"{len(retriever.passages)} passages from {len(retriever.pages)} pages ready "
          f"in {time.perf_counter() - started:.1f}s ({DEFAULT_INDEX_DIR})")
    if len(sys.argv) > 1:
        for hit in retriever.search(" ".join(sys.argv[1:])):
            print(f"{hit.similarity:.2f}  {hit.passage.id:16} {hit.passage.title} | {hit.passage.section}")
