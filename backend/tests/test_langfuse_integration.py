"""Unit tests for the Langfuse v5 integration of the web app backend."""
import asyncio
from unittest.mock import MagicMock

import pytest
from langchain_core.runnables import RunnableLambda
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

import agent


def test_langfuse_sdk_is_v5():
    import langfuse

    assert langfuse.__version__.startswith("5.")


def test_client_uses_config_keys_and_environment():
    assert agent.LANGFUSE_PUBLIC_KEY == "pk-lf-unit-test"
    assert agent.LANGFUSE_ENVIRONMENT == "tonpixo-unit-test"
    assert isinstance(agent.langfuse, Langfuse)


def test_handler_is_bound_to_project_public_key():
    handler = agent.create_langfuse_handler()
    assert isinstance(handler, CallbackHandler)
    # The handler must resolve to the module client (same keys and environment).
    resources = handler._langfuse_client._resources
    assert resources is agent.langfuse._resources
    assert resources.public_key == "pk-lf-unit-test"
    assert resources.environment == "tonpixo-unit-test"


def test_metadata_carries_session_user_and_tags():
    metadata = agent.get_langfuse_metadata("job-123", 42)
    assert metadata["langfuse_session_id"] == "job-123"
    assert metadata["langfuse_user_id"] == "42"
    assert "tonpixo" in metadata["langfuse_tags"]
    assert "langfuse_user_id" not in agent.get_langfuse_metadata("job-123")


def test_trace_id_comes_from_last_trace_id():
    handler = MagicMock(last_trace_id="abc")
    assert agent.get_langfuse_trace_id(handler) == "abc"
    assert agent.get_langfuse_trace_id(MagicMock(last_trace_id=None)) is None
    assert agent.get_langfuse_trace_id(None) is None


def test_mcp_event_attaches_to_trace(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(agent, "langfuse", client)

    assert agent._emit_langfuse_event("mcp_http_call", {"path": "/x"}, "t" * 32, "job-1", "7")
    client.create_event.assert_called_once_with(
        trace_context={"trace_id": "t" * 32}, name="mcp_http_call", metadata={"path": "/x"}
    )

    client.reset_mock()
    assert agent._emit_langfuse_event("mcp_http_call", {"path": "/x"}, None, "job-1")
    client.create_event.assert_called_once_with(name="mcp_http_call", metadata={"path": "/x"})


def test_mcp_event_failure_falls_back_to_summary_score(monkeypatch):
    client = MagicMock()
    client.create_event.side_effect = RuntimeError("boom")
    monkeypatch.setattr(agent, "langfuse", client)

    events = [{"path": "/a", "status_code": 200}, {"path": "/b", "status_code": 500}]
    agent._flush_mcp_events_to_langfuse(events, job_id="job-1", trace_id="t" * 32)

    client.create_score.assert_called_once()
    kwargs = client.create_score.call_args.kwargs
    assert kwargs["trace_id"] == "t" * 32
    assert kwargs["name"] == "mcp_calls"
    assert "errors=1" in kwargs["comment"]


def test_process_chat_flushes_after_mcp_events(monkeypatch):
    calls: list[str] = []
    client = MagicMock()
    client.create_event.side_effect = lambda **_: calls.append("event")
    client.flush.side_effect = lambda: calls.append("flush")
    monkeypatch.setattr(agent, "langfuse", client)

    class FakeAgent:
        def invoke(self, state, config):
            assert config["metadata"]["langfuse_session_id"] == "job-9"
            agent._capture_mcp_observation({"path": "/tool", "status_code": 200})
            return {"messages": [agent.AIMessage(content="answer")]}

    monkeypatch.setattr(agent, "create_agent_graph", lambda job_id: FakeAgent())
    monkeypatch.setattr(agent, "get_langfuse_trace_id", lambda handler: "f" * 32)

    result = agent.process_chat("job-9", "hello?", user_id="5")

    assert result["trace_id"] == "f" * 32
    assert calls == ["event", "flush"]


def test_process_chat_stream_flushes_when_client_disconnects(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(agent, "langfuse", client)

    class FakeAgent:
        async def astream_events(self, state, config, version):
            yield {"event": "on_tool_start", "name": "sql_query", "data": {}}
            yield {"event": "on_tool_end", "name": "sql_query", "data": {}}

    monkeypatch.setattr(agent, "create_agent_graph", lambda job_id: FakeAgent())

    async def consume_then_disconnect():
        stream = agent.process_chat_stream("job-1", "hello?")
        first = await stream.__anext__()
        assert first == {"type": "tool_start", "tool": "sql_query"}
        await stream.aclose()  # client went away mid-stream

    asyncio.run(consume_then_disconnect())

    client.flush.assert_called()


def test_callback_handler_exports_session_user_and_environment():
    """Run a real v5 client + CallbackHandler against an in-memory exporter."""
    exporter = InMemorySpanExporter()
    client = Langfuse(
        public_key="pk-lf-export-test",
        secret_key="sk-lf-export-test",
        base_url="http://127.0.0.1:9",
        environment="tonpixo-main",
        span_exporter=exporter,
    )
    handler = CallbackHandler(public_key="pk-lf-export-test")
    chain = RunnableLambda(lambda x: f"echo {x}")

    result = chain.invoke(
        "hi",
        {"callbacks": [handler], "metadata": agent.get_langfuse_metadata("job-777", 99)},
    )
    client.flush()

    assert result == "echo hi"
    assert handler.last_trace_id
    spans = exporter.get_finished_spans()
    assert spans, "no spans exported"
    attrs = [dict(span.attributes or {}) for span in spans]
    assert any(a.get("session.id") == "job-777" for a in attrs), attrs
    assert any(a.get("user.id") == "99" for a in attrs), attrs
    assert all(a.get("langfuse.environment") == "tonpixo-main" for a in attrs), attrs
    assert {format(s.context.trace_id, "032x") for s in spans} == {handler.last_trace_id}
    client.shutdown()


def test_score_endpoint_creates_score_and_flushes(monkeypatch):
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    import main

    client = MagicMock()
    monkeypatch.setattr(main, "langfuse", client)
    monkeypatch.setattr(main, "flush_langfuse", client.flush)

    response = fastapi_testclient.TestClient(main.app).post(
        "/api/score", json={"trace_id": "a" * 32, "score": 1}
    )

    assert response.json() == {"status": "success"}
    client.create_score.assert_called_once_with(
        trace_id="a" * 32, name="user-feedback", value=1.0, comment=None
    )
    client.flush.assert_called_once()
