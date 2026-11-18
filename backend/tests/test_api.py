"""API tests with a fake Claude client and the small test page set; nothing here calls the real API."""
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module  # noqa: E402  (conftest puts backend/ on sys.path)
from assistant import Assistant, plain_text  # noqa: E402
from feedback_store import FeedbackStore  # noqa: E402
from schemas import ModelAnswer  # noqa: E402
from usage_log import UsageLog, summarize  # noqa: E402


class FakeMessages:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        # A list gives one response per call, in order (for example an answer, then its phone script).
        result = self.result[len(self.calls) - 1] if isinstance(self.result, list) else self.result
        if isinstance(result, Exception):
            raise result
        return result


def usage(**overrides):
    base = dict(input_tokens=10, output_tokens=5, cache_creation_input_tokens=0, cache_read_input_tokens=900)
    return SimpleNamespace(**{**base, **overrides})


def parsed(answer: ModelAnswer | None, stop_reason="end_turn"):
    content = [SimpleNamespace(type="text", text=answer.model_dump_json())] if answer else []
    return SimpleNamespace(content=content, stop_reason=stop_reason, usage=usage())


def answer(**overrides):
    base = dict(
        status="answered", tier="verified", is_policy=False, confidence="high", category="PBS Passport",
        summary="Enter the activation code at pbs.org/passport.", steps=["Open pbs.org/passport", "Enter the code"],
        details=[], note="", passage_ids=["P1"], related_passage_ids=[],
    )
    return ModelAnswer(**{**base, **overrides})


@pytest.fixture
def api(monkeypatch, tmp_path, retriever):
    def make(result, prompt_cache=True):
        messages = FakeMessages(result)
        client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
        assistant = Assistant(retriever, client, "test-model", "low", top_k=4,
                              prompt_cache=prompt_cache, usage_log=UsageLog(tmp_path / "usage.jsonl"))
        monkeypatch.setattr(app_module, "assistant", assistant)
        monkeypatch.setattr(app_module, "feedback_store", FeedbackStore(tmp_path / "feedback.jsonl"))
        return TestClient(app_module.app), messages
    return make


def pid_for(retriever, question, page_id, k=4):
    """The passage id (P1, P2, ...) the assistant gives to the first passage of page_id for this question."""
    hits = retriever.search(question, k=k)
    return next(f"P{i}" for i, h in enumerate(hits, 1) if h.passage.page_id == page_id)


QUESTION = "how do I enter my passport activation code"


# ---------- retrieval goes into the prompt ----------

def test_retrieved_passages_go_in_the_user_turn(api):
    client, messages = api(parsed(answer()))
    client.post("/api/ask", json={"question": QUESTION})
    call = messages.calls[0]
    user_turn = call["messages"][-1]["content"]
    assert user_turn.startswith("<passages>") and user_turn.endswith(f"Question: {QUESTION}")
    assert '<passage id="P1"' in user_turn and "activation code" in user_turn
    assert user_turn.count("<passage ") == 4
    # Instructions only in the (cacheable) system prompt; no page text, no tools.
    assert len(call["system"]) == 1 and "<passage id=" not in call["system"][0]["text"]
    assert "tools" not in call
    assert call["fallbacks"] == "default"
    assert call["output_config"]["format"]["type"] == "json_schema"


def test_follow_up_search_includes_the_previous_question(api, retriever):
    client, messages = api(parsed(answer()))
    client.post("/api/ask", json={
        "question": "and on my TV?",
        "history": [
            {"role": "assistant", "text": "dangling greeting"},
            {"role": "user", "text": "How do I download the PBS app on Roku?"},
            {"role": "assistant", "text": "Open the Roku Channel Store."},
        ],
    })
    sent = messages.calls[0]["messages"]
    assert [m["role"] for m in sent] == ["user", "assistant", "user"]
    assert sent[-1]["content"].endswith("Question: and on my TV?")
    assert 'title="How do I download the PBS app on Roku?"' in sent[-1]["content"]


# ---------- answers and citations ----------

def test_answer_cites_the_exact_passage(api, retriever):
    pid = pid_for(retriever, QUESTION, "hp_activate")
    client, _ = api(parsed(answer(passage_ids=[pid, pid])))
    body = client.post("/api/ask", json={"question": QUESTION}).json()
    assert body["status"] == "answered" and body["tier"] == "verified" and body["confidence"] == "high"
    [citation] = body["citations"]
    assert citation["sourceId"] == pid and citation["id"] == "hp_activate"
    assert citation["url"] == "https://help.pbs.org/hp_activate"
    assert citation["owner"] == "PBS" and citation["updated"] == "2025-11-03"
    assert citation["crawled"] == "2026-11-09"
    assert citation["excerpt"].startswith("Go to pbs.org/passport and enter the activation code")
    assert "**" not in citation["excerpt"] and "](" not in citation["excerpt"]
    assert body["score"] is None


def test_station_and_wisconsin_citations(api, retriever):
    q = "passport reset to change the member email in mvault, and how much to donate"
    hits = retriever.search(q, k=4)
    pids = [f"P{i}" for i, h in enumerate(hits, 1) if h.passage.page_id in ("ds_mvault", "pw_faq")]
    client, _ = api(parsed(answer(passage_ids=pids)))
    citations = client.post("/api/ask", json={"question": q}).json()["citations"]
    by_page = {c["id"]: c for c in citations}
    assert by_page["ds_mvault"]["audience"] == "station_staff"
    assert by_page["ds_mvault"]["owner"] == "PBS"
    assert by_page["pw_faq"]["owner"] == "PBS Wisconsin"
    assert by_page["pw_faq"]["updated"] is None  # the page shows no date
    assert by_page["pw_faq"]["crawled"] == "2026-11-09"


def test_related_are_other_pages(api, retriever):
    cited = pid_for(retriever, QUESTION, "hp_activate")
    other = pid_for(retriever, QUESTION, "hp_locked")
    client, _ = api(parsed(answer(passage_ids=[cited], related_passage_ids=[cited, other, "P99"])))
    body = client.post("/api/ask", json={"question": QUESTION}).json()
    assert body["related"] == [{"id": "hp_locked", "question": "Why does it say this video is only available "
                                                               "to members with Passport?"}]


def test_duplicate_article_is_cited_once(api, retriever, monkeypatch):
    hits = retriever.search(QUESTION, k=4)
    twin = hits[0].passage.__class__(**{**hits[0].passage.__dict__, "id": "hp_twin#0", "page_id": "hp_twin"})
    monkeypatch.setattr(retriever, "search", lambda q, k: [hits[0], type(hits[0])(twin, 0.5, 0.1)])
    client, _ = api(parsed(answer(passage_ids=["P1", "P2"])))
    assert [c["sourceId"] for c in client.post("/api/ask", json={"question": QUESTION}).json()["citations"]] == ["P1"]


def test_passage_ids_it_was_not_given_are_dropped(api, retriever):
    pid = pid_for(retriever, QUESTION, "hp_activate")
    client, _ = api(parsed(answer(passage_ids=["P99", pid])))
    body = client.post("/api/ask", json={"question": QUESTION}).json()
    assert [c["sourceId"] for c in body["citations"]] == [pid]


def test_answer_without_valid_citations_becomes_no_answer_with_closest_pages(api):
    client, _ = api(parsed(answer(passage_ids=["P99"])))
    body = client.post("/api/ask", json={"question": QUESTION}).json()
    assert body["status"] == "no_answer"
    assert 1 <= len(body["closest"]) <= 3
    assert body["closest"][0]["id"] == "hp_activate"
    assert len({c["id"] for c in body["closest"]}) == len(body["closest"])


def test_refusal_becomes_no_answer(api):
    client, _ = api(parsed(None, stop_reason="refusal"))
    assert client.post("/api/ask", json={"question": "q"}).json()["status"] == "no_answer"


# ---------- chat, general answers, policy guard (SCRUM-41) ----------

def test_greeting_gets_a_chat_reply(api):
    client, _ = api(parsed(answer(status="chat", confidence="none", summary="Hi! How can I help?", passage_ids=[])))
    body = client.post("/api/ask", json={"question": "hi"}).json()
    assert body == {"status": "chat", "message": "Hi! How can I help?", "latencyMs": body["latencyMs"]}


def test_general_troubleshooting_is_labeled_and_uncited(api):
    client, _ = api(parsed(answer(tier="general", confidence="medium", passage_ids=[],
                                  summary="Restart the app and check for updates.")))
    body = client.post("/api/ask", json={"question": "app keeps freezing"}).json()
    assert (body["status"], body["tier"], body["citations"]) == ("answered", "general", [])


def test_policy_question_without_citations_becomes_no_answer(api):
    client, _ = api(parsed(answer(tier="general", is_policy=True, passage_ids=[],
                                  summary="Refunds are issued within 30 days.")))
    assert client.post("/api/ask", json={"question": "can I get a refund?"}).json()["status"] == "no_answer"


# ---------- sources ----------

def test_sources_lists_crawled_pages_with_owner_and_dates(api):
    client, _ = api(parsed(answer()))
    res = client.get("/api/sources")
    assert res.status_code == 200
    body = res.json()
    assert body["lastCrawled"] == "2026-11-09"
    by_id = {s["id"]: s for s in body["sources"]}
    assert len(by_id) == 5
    activate = by_id["hp_activate"]
    assert activate["title"] == "How do I activate PBS Passport?"
    assert activate["url"] == "https://help.pbs.org/hp_activate"
    assert activate["owner"] == "PBS" and activate["updated"] == "2025-11-03" and activate["crawled"] == "2026-11-09"
    assert activate["passages"] == 1 and activate["topic"] == "PBS Passport"
    assert by_id["ds_mvault"]["owner"] == "PBS" and by_id["ds_mvault"]["audience"] == "station_staff"
    assert by_id["pw_faq"]["owner"] == "PBS Wisconsin" and by_id["pw_faq"]["updated"] is None
    # Grouped by owner, then alphabetical.
    owners = [s["owner"] for s in body["sources"]]
    assert owners == sorted(owners)


def test_sources_work_without_an_api_key(monkeypatch, retriever):
    monkeypatch.setattr(app_module, "assistant", Assistant(retriever, None, "test-model", "low"))
    res = TestClient(app_module.app).get("/api/sources")
    assert res.status_code == 200 and len(res.json()["sources"]) == 5


def test_sources_allow_the_frontend_origin(api):
    client, _ = api(parsed(answer()))
    origin = app_module.ALLOWED_ORIGINS[0]
    res = client.get("/api/sources", headers={"Origin": origin})
    assert res.headers["access-control-allow-origin"] == origin


# ---------- errors ----------

def test_no_key_returns_503(monkeypatch, retriever):
    monkeypatch.setattr(app_module, "assistant", Assistant(retriever, None, "test-model", "low"))
    client = TestClient(app_module.app)
    res = client.post("/api/ask", json={"question": "q"})
    assert res.status_code == 503 and res.json()["error"] == "assistant_unavailable"
    health = client.get("/health").json()
    assert health["mode"] == "no_key" and health["sources"] == 5 and health["passages"] >= 5


def test_upstream_error_returns_502(api):
    error = anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
    client, _ = api(error)
    res = client.post("/api/ask", json={"question": "q"})
    assert res.status_code == 502 and res.json()["error"] == "upstream_error"


def test_unparseable_output_returns_502(api):
    client, _ = api(SimpleNamespace(content=[SimpleNamespace(type="text", text="not json")],
                                    stop_reason="end_turn", usage=usage()))
    assert client.post("/api/ask", json={"question": "q"}).status_code == 502


@pytest.mark.parametrize("question", ["", "x" * 2001])
def test_invalid_question_returns_422(api, question):
    client, _ = api(parsed(answer()))
    assert client.post("/api/ask", json={"question": question}).status_code == 422


# ---------- prompt cache setting and usage log (SCRUM-35, SCRUM-36) ----------

@pytest.mark.parametrize("enabled", [True, False])
def test_prompt_cache_setting(api, enabled):
    client, messages = api(parsed(answer()), prompt_cache=enabled)
    client.post("/api/ask", json={"question": "q"})
    assert ("cache_control" in messages.calls[0]["system"][0]) is enabled


def test_usage_is_logged_per_request(api, tmp_path):
    client, _ = api(parsed(answer()))
    client.post("/api/ask", json={"question": QUESTION})
    records = UsageLog(tmp_path / "usage.jsonl").records()
    assert records[0]["cache_read_input_tokens"] == 900 and records[0]["passages"] == 4
    assert summarize(records)["cache_read_share"] == round(900 / 910, 3)


def test_plain_text_strips_markdown():
    md = "## Steps\n\n**Open** [the page](https://x.org) [image: logo]\n\n\n\n- `code`"
    assert plain_text(md) == "Steps\n\nOpen the page\n\n- code"


# ---------- feedback ----------

def test_feedback_round_trip(api):
    client, _ = api(parsed(answer()))
    res = client.post("/api/feedback", json={
        "kind": "survey", "rating": 4, "category": "Ease of use", "comment": "Nice", "by": "Jane Doe",
        "conversationId": "abc",
    })
    assert res.status_code == 201
    created = res.json()
    assert created["conversationId"] == "abc" and created["id"]
    client.post("/api/feedback", json={"kind": "flag", "question": "q", "reason": "Outdated", "by": "Jane Doe"})
    listed = client.get("/api/feedback").json()
    assert [f["kind"] for f in listed] == ["flag", "survey"]


def test_feedback_rejects_bad_rating(api):
    client, _ = api(parsed(answer()))
    assert client.post("/api/feedback", json={"kind": "survey", "rating": 9}).status_code == 422


def test_vote_is_saved_with_question_and_answer(api):
    client, _ = api(parsed(answer()))
    res = client.post("/api/feedback", json={
        "kind": "vote", "helpful": False, "question": "q", "answer": "a", "note": "Wrong device", "by": "Jane Doe",
    })
    assert res.status_code == 201
    saved = client.get("/api/feedback").json()[0]
    assert (saved["kind"], saved["helpful"], saved["answer"], saved["note"]) == ("vote", False, "a", "Wrong device")

# ---------- bullet-first answers and on-demand phone scripts (SCRUM-40) ----------

def script_result(script="Thanks for calling. Please sign out and sign back in."):
    """A structured rewrite from the same fake Claude client."""
    from schemas import PhoneScriptAnswer
    item = PhoneScriptAnswer(script=script)
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=item.model_dump_json())],
                           stop_reason="end_turn", usage=usage())


def test_default_answer_is_bullets_and_has_reference(api):
    client, messages = api(parsed(answer()))
    body = client.post("/api/ask", json={"question": "Passport videos locked"}).json()
    assert body["status"] == "answered"
    assert body["format"] == "bullets"
    assert body["answerId"]
    assert body["steps"] == ["Open pbs.org/passport", "Enter the code"]
    assert "Default to key-point" in messages.calls[0]["system"][0]["text"]


def test_phone_script_reuses_passage_ids_and_citations_without_retrieval(api):
    client, messages = api([parsed(answer(passage_ids=["P1", "P2"])), script_result()])
    first = client.post("/api/ask", json={"question": "Passport videos locked"}).json()
    second = client.post("/api/ask", json={
        "question": "Passport videos locked", "format": "phone_script", "answerId": first["answerId"],
    }).json()
    assert second["status"] == "answered"
    assert second["format"] == "phone_script"
    assert "Please sign out" in second["phoneScript"]
    assert second["citations"] == first["citations"]
    assert second["answerId"] == first["answerId"]
    assert len(messages.calls) == 2
    script_call = messages.calls[1]
    assert "tools" not in script_call  # no web fetch / new retrieval
    assert script_call["output_config"]["format"]["type"] == "json_schema"
    import json
    script_payload = json.loads(script_call["messages"][0]["content"])
    cited = [c["sourceId"] for c in first["citations"]]
    assert cited and script_payload["passage_ids"] == cited
    assert [c["sourceId"] for c in script_payload["sources"]] == cited
    assert "<passages>" not in script_call["messages"][0]["content"]  # no new retrieval


def test_second_phone_script_request_is_cached(api):
    client, messages = api([parsed(answer()), script_result()])
    first = client.post("/api/ask", json={"question": "q"}).json()
    body = {"question": "q", "format": "phone_script", "answerId": first["answerId"]}
    one = client.post("/api/ask", json=body).json()
    two = client.post("/api/ask", json=body).json()
    assert one["phoneScript"] == two["phoneScript"]
    assert len(messages.calls) == 2


@pytest.mark.parametrize("body", [
    {"question": "q", "format": "phone_script"},
    {"question": "q", "format": "phone_script", "answerId": "unknown"},
])
def test_phone_script_requires_existing_answer(api, body):
    client, messages = api(parsed(answer()))
    res = client.post("/api/ask", json=body)
    assert res.status_code == 400
    assert res.json()["error"] == "answer_not_available"
    assert messages.calls == []


def test_phone_script_rejects_mismatched_question(api):
    client, messages = api(parsed(answer()))
    initial = client.post("/api/ask", json={"question": "q"}).json()
    res = client.post("/api/ask", json={
        "question": "a different question", "format": "phone_script", "answerId": initial["answerId"],
    })
    assert res.status_code == 400
    assert len(messages.calls) == 1


def test_phone_script_rejects_expired_answer(api, monkeypatch):
    import assistant as assistant_module
    current = [10.0]
    monkeypatch.setattr(assistant_module.time, "monotonic", lambda: current[0])
    client, messages = api(parsed(answer()))
    initial = client.post("/api/ask", json={"question": "q"}).json()
    current[0] += assistant_module.ANSWER_CACHE_TTL + 1
    res = client.post("/api/ask", json={
        "question": "q", "format": "phone_script", "answerId": initial["answerId"],
    })
    assert res.status_code == 400
    assert len(messages.calls) == 1


def test_script_preserves_general_no_citations(api):
    initial = parsed(answer(tier="general", confidence="medium", passage_ids=[], summary="Restart the app."))
    client, _ = api([initial, script_result("Please restart the app.")])
    first = client.post("/api/ask", json={"question": "app freezing"}).json()
    script = client.post("/api/ask", json={
        "question": "app freezing", "format": "phone_script", "answerId": first["answerId"],
    }).json()
    assert script["tier"] == "general"
    assert first["citations"] == script["citations"] == []


def test_bad_format_rejected_by_schema(api):
    client, _ = api(parsed(answer()))
    res = client.post("/api/ask", json={"question": "q", "format": "unknown"})
    assert res.status_code == 422
