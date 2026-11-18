"""Passage splitting, keyword scoring, fused search and the on-disk vector cache (no model download)."""
import pytest
import numpy as np
from conftest import HashEmbedder, make_page

import rag


def words(n, word="word"):
    return " ".join([word] * n)


def test_short_page_is_one_passage():
    [p] = rag.split_page(make_page("hp_x", "Title", "One short paragraph."))
    assert p.id == "hp_x#0" and p.text == "One short paragraph." and p.section == ""


def test_long_page_splits_at_headings_and_paragraphs():
    body = "\n\n".join([
        words(100, "intro"),
        "## Activation",
        words(150, "activate"),
        words(150, "code"),
        "## Devices",
        words(80, "roku"),
    ])
    passages = rag.split_page(make_page("hp_long", "Guide", body))
    assert all(len(p.text.split()) <= rag.MAX_WORDS + 1 for p in passages)
    assert [p.id for p in passages] == [f"hp_long#{i}" for i in range(len(passages))]
    assert passages[0].section == ""
    assert any(p.section == "Activation" and "activate" in p.text for p in passages)
    assert passages[-1].section == "Devices" and passages[-1].text.startswith("## Devices")
    # Nothing lost or duplicated.
    joined = "\n\n".join(p.text for p in passages)
    assert joined.count("roku") == 80 and joined.count("activate") == 150


def test_small_sections_are_kept_together():
    body = "## A\n\nshort a\n\n## B\n\nshort b\n\n## C\n\nshort c"
    assert len(rag.split_page(make_page("hp_s", "T", body))) == 1


def test_very_long_paragraph_is_split_by_sentence():
    body = " ".join(f"Sentence number {i} is here." for i in range(200))
    passages = rag.split_page(make_page("hp_p", "T", body))
    assert len(passages) > 1 and all(len(p.text.split()) <= rag.MAX_WORDS for p in passages)


def test_search_text_includes_where_the_passage_sits():
    [p] = rag.split_page(make_page("hp_x", "How do I sign in?", "Body.", breadcrumb=("Roku",)))
    assert p.search_text.startswith("Roku > How do I sign in?")


def test_bm25_prefers_matching_and_rarer_terms():
    docs = [rag.tokenize(t) for t in ["roku app crash", "apple tv app", "passport activation code"]]
    scores = rag.BM25(docs).scores(rag.tokenize("roku app"))
    assert scores.argmax() == 0 and scores[2] == 0


def test_search_finds_the_right_page(retriever):
    hits = retriever.search("activation code from email", k=3)
    assert hits[0].passage.page_id == "hp_activate"
    hits = retriever.search("change the email a member uses for passport mvault", k=3)
    assert hits[0].passage.page_id == "ds_mvault"


def test_search_limits_passages_per_page(pages_file, tmp_path):
    long_body = "\n\n".join(f"## Part {i}\n\n{words(70, 'roku')} channel" for i in range(6))
    pages = [make_page("hp_big", "Roku guide", long_body), make_page("hp_other", "Roku tips", "roku channel tips")]
    passages = [p for page in pages for p in rag.split_page(page)]
    r = rag.Retriever(passages, {p["id"]: p for p in pages}, HashEmbedder(), index_dir=None)
    hits = r.search("roku channel", k=6, per_page=2)
    assert sum(h.passage.page_id == "hp_big" for h in hits) == 2


def test_vectors_are_cached_and_rebuilt_when_pages_change(pages_file, tmp_path):
    class CountingEmbedder(HashEmbedder):
        calls = 0

        def embed_documents(self, texts):
            CountingEmbedder.calls += 1
            return super().embed_documents(texts)

    index = tmp_path / "index"
    first = rag.Retriever.load(pages_file, CountingEmbedder(), index)
    second = rag.Retriever.load(pages_file, CountingEmbedder(), index)
    assert CountingEmbedder.calls == 1
    assert np.allclose(first.vectors, second.vectors)

    pages_file.write_text(pages_file.read_text().replace("Roku Channel Store", "Roku store"))
    rag.Retriever.load(pages_file, CountingEmbedder(), index)
    assert CountingEmbedder.calls == 2


def test_folder_loads_every_pages_file(tmp_path):
    import json
    (tmp_path / "docs_pbs").mkdir()
    (tmp_path / "pages.jsonl").write_text(json.dumps(make_page("hp_a", "A", "alpha text")) + "\n")
    (tmp_path / "docs_pbs" / "pages.jsonl").write_text(
        json.dumps(make_page("dp_b", "B", "beta text", site="docs.pbs.org")) + "\n"
        + json.dumps(make_page("hp_a", "A copy", "duplicate")) + "\n")
    passages, pages = rag.load_passages(tmp_path)
    assert sorted(pages) == ["dp_b", "hp_a"] and pages["hp_a"]["title"] == "A"
    r = rag.Retriever(passages, pages, HashEmbedder(), index_dir=None)
    assert r.owner(r.by_id["dp_b#0"]) == "PBS"


@pytest.mark.parametrize("site, owner", [
    ("help.pbs.org", "PBS"),
    ("docs.pbs.org", "PBS"),
    ("digitalsupport-stations.pbs.org", "PBS"),
    ("pbswisconsin.org", "PBS Wisconsin"),
    ("www.pbswisconsin.org", "PBS Wisconsin"),
    ("example.com", "example.com"),
])
def test_owner_comes_from_the_domain(site, owner):
    assert rag.owner_for(site) == owner
