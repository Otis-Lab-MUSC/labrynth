"""Reconnect behaviour of the CLI live monitor (``MonitorMixin._stream_events``).

The WebSocket and the REST client are faked; ``asyncio.sleep`` is patched so
backoff delays do not slow the run.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

import httpx
import pytest
import websockets

from cli.app import ReacherCLI
from cli.monitor import CLEAN_CLOSE_DELAY_SECONDS
from cli.state import SessionState

SESSION_ID = "abcdef0123456789"
TIMEOUT_SECONDS = 5


class FakeSocket:
    """An open socket that yields its frames, then closes cleanly."""

    def __init__(self, frames: Sequence[str | bytes] = ()) -> None:
        self.frames = list(frames)

    def __aiter__(self) -> FakeSocket:
        return self

    async def __anext__(self) -> str | bytes:
        if not self.frames:
            raise StopAsyncIteration
        return self.frames.pop(0)


class FakeConnection:
    """Async context manager returned by the patched ``websockets.connect``."""

    def __init__(self, outcome: BaseException | None, frames: Sequence[str | bytes] = ()) -> None:
        self.outcome = outcome
        self.frames = frames

    async def __aenter__(self) -> FakeSocket:
        if self.outcome:
            raise self.outcome
        return FakeSocket(self.frames)

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


SLEPT: list[float] = []


def script_connections(
    monkeypatch: pytest.MonkeyPatch,
    outcomes: Sequence[BaseException | None],
    first_frames: Sequence[str | bytes] = (),
) -> list[int]:
    """Serve ``outcomes`` to successive connects, then block forever; return the connect counter.

    ``first_frames`` are delivered on the first connection. Requested sleep delays land in ``SLEPT``.
    """
    remaining = list(outcomes)
    attempts: list[int] = []
    SLEPT.clear()

    def connect(url: str, **kwargs: object) -> FakeConnection:
        attempts.append(1)
        frames = first_frames if len(attempts) == 1 else ()
        if remaining:
            return FakeConnection(remaining.pop(0), frames)
        return FakeConnection(asyncio.CancelledError())

    monkeypatch.setattr(websockets, "connect", connect)

    real_sleep = asyncio.sleep

    async def fast_sleep(delay: float, result: object = None) -> object:
        SLEPT.append(delay)
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
        raise httpx.ConnectError("host down")

    api.list_sessions = unreachable  # type: ignore[method-assign]
    refused = [ConnectionRefusedError("refused")] * 6
    attempts = script_connections(monkeypatch, refused)
    run_stream(cli)
    assert cli.session is not None
    assert cli.session.state != "gone"
    assert len(attempts) == 7


def test_stream_works_when_websockets_submodules_are_not_preloaded(monkeypatch: pytest.MonkeyPatch) -> None:
    """The monitor must not rely on ``websockets.exceptions`` having been imported elsewhere."""
    monkeypatch.delattr(websockets, "exceptions", raising=False)
    api = FakeApi()
    api.listed_sessions = []
    cli = make_cli(api)
    script_connections(monkeypatch, [ConnectionRefusedError("refused")] * 5)
    run_stream(cli)
    assert cli.session is not None
    assert cli.session.state == "gone"


def test_non_object_frame_does_not_kill_the_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    """A JSON frame that is not an object is ignored and the link carries on."""
    api = FakeApi()
    cli = make_cli(api)
    attempts = script_connections(monkeypatch, [None, None], first_frames=["[1, 2]", '"text"', "7"])
    run_stream(cli)
    assert len(attempts) == 3


def test_non_utf8_binary_frame_is_skipped_and_the_link_carries_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """A binary frame that is not valid UTF-8 is ignored instead of dropping the link."""
    api = FakeApi()
    cli = make_cli(api)
    attempts = script_connections(monkeypatch, [None, None], first_frames=[b"\x80\x81abc", '{"type": "x"}'])
    run_stream(cli)
    assert len(attempts) == 3
    assert not any("Live link down" in text for _, text in cli.monitor_lines)


def test_replay_handler_bug_is_logged_and_the_link_is_restored(monkeypatch: pytest.MonkeyPatch) -> None:
    """A handler bug while replaying missed events must not end the stream task."""
    api = FakeApi()
    cli = make_cli(api)

    async def one_missed_event(sid: str, since: int | None = None) -> dict[str, object]:
        return {"data": [{"device": "LEVER_RH"}], "total": 1}

    api.get_behavior = one_missed_event  # type: ignore[method-assign]

    def failing_handler(msg: dict[str, object], replay: bool = False) -> None:
        if replay:
            raise RuntimeError("handler bug")

    cli._handle_ws_message = failing_handler  # type: ignore[method-assign]
    attempts = script_connections(monkeypatch, [None, None])
    run_stream(cli)
    assert len(attempts) == 3
    assert any("Bad event message" in text for _style, text in cli.monitor_lines)
    assert any("Live link restored" in text for _style, text in cli.monitor_lines)


def test_clean_close_waits_before_reconnecting(monkeypatch: pytest.MonkeyPatch) -> None:
    """A socket that closes cleanly is retried after a delay, not in a tight loop."""
    api = FakeApi()
    cli = make_cli(api)
    script_connections(monkeypatch, [None, None])
    run_stream(cli)
    assert CLEAN_CLOSE_DELAY_SECONDS in SLEPT


def test_send_limits_without_a_session_sends_nothing() -> None:
    """With no session there is nothing to send: report False instead of raising."""
    cli = make_cli(FakeApi())
    cli.session = None
    assert asyncio.run(cli._send_limits()) is False
