"""Reconnect behaviour of the CLI live monitor (``MonitorMixin._stream_events``).

The WebSocket and the REST client are faked; ``asyncio.sleep`` is patched so
backoff delays do not slow the run.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

import pytest
import websockets

from cli.app import ReacherCLI, SessionState

SESSION_ID = "abcdef0123456789"
TIMEOUT_SECONDS = 5


class FakeSocket:
    """An open socket that yields no messages and closes at once."""

    def __aiter__(self) -> FakeSocket:
        return self

    async def __anext__(self) -> str:
        raise StopAsyncIteration


class FakeConnection:
    """Async context manager returned by the patched ``websockets.connect``."""

    def __init__(self, outcome: BaseException | None) -> None:
        self.outcome = outcome

    async def __aenter__(self) -> FakeSocket:
        if self.outcome:
            raise self.outcome
        return FakeSocket()

    async def __aexit__(self, *exc_info: object) -> None:
        return None


class FakeApi:
    """REST client double that records calls and lists a configurable session set."""

    def __init__(self) -> None:
        self.listed_sessions: list[dict[str, str]] = [{"session_id": SESSION_ID}]
        self.calls: list[str] = []

    def ws_url(self, sid: str) -> str:
        return f"ws://test/ws/{sid}"

    async def list_sessions(self) -> dict[str, object]:
        self.calls.append("list_sessions")
        return {"sessions": self.listed_sessions}

    async def get_session(self, sid: str) -> dict[str, object]:
        self.calls.append("get_session")
        return {}

    async def get_behavior(self, sid: str, since: int | None = None) -> dict[str, object]:
        self.calls.append("get_behavior")
        return {"data": [], "total": 0}


def make_cli(api: FakeApi) -> ReacherCLI:
    """Build a CLI with one live session and a fake API."""
    cli = ReacherCLI(port=0)
    cli.api = api  # type: ignore[assignment]
    cli._invalidate = lambda: None  # type: ignore[method-assign]
    cli.session = SessionState(id=SESSION_ID, port="SIMULATOR")
    return cli


def script_connections(monkeypatch: pytest.MonkeyPatch, outcomes: Sequence[BaseException | None]) -> list[int]:
    """Serve ``outcomes`` to successive connects, then block forever; return the connect counter."""
    remaining = list(outcomes)
    attempts: list[int] = []

    def connect(url: str, **kwargs: object) -> FakeConnection:
        attempts.append(1)
        if remaining:
            return FakeConnection(remaining.pop(0))
        return FakeConnection(asyncio.CancelledError())

    monkeypatch.setattr(websockets, "connect", connect)

    real_sleep = asyncio.sleep

    async def fast_sleep(delay: float, result: object = None) -> object:
        return await real_sleep(0, result)

    monkeypatch.setattr(asyncio, "sleep", fast_sleep)
    return attempts


def run_stream(cli: ReacherCLI) -> None:
    """Run ``_stream_events`` until it returns or cancels, failing if it hangs."""

    async def drive() -> None:
        await asyncio.wait_for(cli._stream_events(SESSION_ID), TIMEOUT_SECONDS)

    asyncio.run(drive())


def test_destroyed_session_stops_retrying_after_silent_reconnect(monkeypatch: pytest.MonkeyPatch) -> None:
    """A handshake the backend accepts for a destroyed session must not keep the monitor alive."""
    api = FakeApi()
    cli = make_cli(api)
    attempts = script_connections(monkeypatch, [None, None])
    original = api.list_sessions

    async def destroyed_after_first_link() -> dict[str, object]:
        api.listed_sessions = []
        return await original()

    api.list_sessions = destroyed_after_first_link  # type: ignore[method-assign]
    run_stream(cli)
    assert cli.session is not None
    assert cli.session.state == "gone"
    assert len(attempts) == 2
    assert "get_behavior" not in api.calls
    assert any("no longer exists" in text for _style, text in cli.monitor_lines)


def test_existing_session_recovers_missed_events_on_reconnect(monkeypatch: pytest.MonkeyPatch) -> None:
    """A session that still exists gets the recovery pass and the 'restored' notice."""
    api = FakeApi()
    cli = make_cli(api)
    script_connections(monkeypatch, [None, None])
    run_stream(cli)
    assert cli.session is not None
    assert cli.session.state != "gone"
    assert "get_behavior" in api.calls
    assert any("Live link restored" in text for _style, text in cli.monitor_lines)


def test_refused_connections_trigger_existence_check_on_fifth_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    """Five refused connects in a row end with a session lookup and, if gone, a stop."""
    api = FakeApi()
    api.listed_sessions = []
    cli = make_cli(api)
    refused = [ConnectionRefusedError("refused")] * 5
    attempts = script_connections(monkeypatch, refused)
    run_stream(cli)
    assert cli.session is not None
    assert cli.session.state == "gone"
    assert len(attempts) == 5
    assert api.calls.count("list_sessions") == 1


def test_unreachable_host_keeps_retrying(monkeypatch: pytest.MonkeyPatch) -> None:
    """When the session lookup itself fails, the monitor keeps trying rather than giving up."""
    api = FakeApi()
    cli = make_cli(api)

    async def unreachable() -> dict[str, object]:
        raise ConnectionError("host down")

    api.list_sessions = unreachable  # type: ignore[method-assign]
    refused = [ConnectionRefusedError("refused")] * 6
    attempts = script_connections(monkeypatch, refused)
    run_stream(cli)
    assert cli.session is not None
    assert cli.session.state != "gone"
    assert len(attempts) == 7
