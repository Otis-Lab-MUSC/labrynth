"""Regression tests for the CLI pause state (CLI-1) and integer prompts (CLI-2).

Plain pytest + asyncio.run; no prompt_toolkit Application is started. The
``app`` attribute is a fake that collects background tasks so they can be
drained deterministically.
"""

from __future__ import annotations

import asyncio
import gc
import warnings

import pytest

from cli.app import ReacherCLI, SessionState


class FakeApp:
    def __init__(self):
        self.tasks: list = []

    def create_background_task(self, coro):
        self.tasks.append(coro)

    def invalidate(self):
        pass


class FakeApi:
    def __init__(self):
        self.calls: list[tuple] = []
        self.pause_hook = None
        self.paused = False

    async def pause_program(self, sid):
        self.paused = not self.paused
        status = "paused" if self.paused else "resumed"
        self.calls.append(("pause_program", sid))
        if self.pause_hook:
            self.pause_hook(status)
        return {"status": status}

    async def set_limit(self, sid, limit_type, **kw):
        self.calls.append(("set_limit", sid, limit_type, kw))
        return {"status": "ok"}

    async def send_command(self, sid, code, value=None):
        self.calls.append(("send_command", sid, code, value))
        return {"status": "ok"}


def _cli(paradigm: str = "fr", state: str = "running") -> ReacherCLI:
    cli = ReacherCLI()
    cli.api = FakeApi()
    cli.app = FakeApp()
    cli.session = SessionState(id="s1", port="/dev/null", paradigm=paradigm, state=state)
    cli.ws_connected = True
    return cli


def _drain(cli: ReacherCLI) -> None:
    async def run():
        while cli.app.tasks:
            await cli.app.tasks.pop(0)
    asyncio.run(run())


def _ws_state(cli: ReacherCLI, state: str) -> None:
    cli._handle_ws_message({"type": "session_state", "session_id": cli.session.id,
                            "data": {"state": state}})


def _labels(cli: ReacherCLI) -> list[str]:
    return [item.label for item in cli._program_menu().items]


def _select(cli: ReacherCLI, label: str) -> None:
    item = next(i for i in cli.menu.items if i.label == label)
    cli._run_action(item.action)
    _drain(cli)


# ── CLI-1: pause/resume state ────────────────────────────────────────────


def test_pause_when_ws_update_lands_before_response():
    cli = _cli()
    cli.api.pause_hook = lambda status: _ws_state(cli, status if status == "paused" else "running")

    asyncio.run(cli._pause_program())

    assert cli.session.state == "paused"
    assert cli.status_message == "Session paused"
    assert cli.session.pause_start is not None
    assert "Play (Resume)" in _labels(cli)
    assert "Pause Session" not in _labels(cli)


def test_pause_when_response_lands_before_ws_update():
    cli = _cli()

    asyncio.run(cli._pause_program())
    _ws_state(cli, "paused")

    assert cli.session.state == "paused"
    assert cli.status_message == "Session paused"


def test_pause_then_resume_with_ws_first():
    cli = _cli()
    cli.api.pause_hook = lambda status: _ws_state(cli, status if status == "paused" else "running")

    asyncio.run(cli._pause_program())
    asyncio.run(cli._pause_program())

    assert cli.session.state == "running"
    assert cli.status_message == "Session resumed"
    assert cli.session.pause_start is None
    assert cli.session.paused_time >= 0
    assert "Pause Session" in _labels(cli)


# ── CLI-2: integer prompts reach the backend ──────────────────────────────


@pytest.fixture
def no_unawaited_coroutines():
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        yield
        gc.collect()


def test_prompt_int_input_awaits_async_callback(no_unawaited_coroutines):
    cli = _cli()
    received: list[int] = []

    async def cb(n):
        received.append(n)

    cli._prompt_int_input("Enter X:", cb)
    cli.input_value = "6"
    cli._submit_input()
    _drain(cli)

    assert received == [6]


def test_prompt_int_input_rejects_non_integer():
    cli = _cli()
    received: list[int] = []

    async def cb(n):
        received.append(n)

    cli._prompt_int_input("Enter X:", cb)
    cli.input_value = "six"
    cli._submit_input()
    _drain(cli)

    assert received == []
    assert cli.status_is_error


def test_set_time_limit_reaches_backend(no_unawaited_coroutines):
    cli = _cli()
    cli.menu = cli._limits_menu()

    _select(cli, "Set Time Limit (s)")
    assert cli.mode == "input"
    cli.input_value = "6"
    cli._submit_input()
    _drain(cli)

    set_limit = [c for c in cli.api.calls if c[0] == "set_limit"]
    assert set_limit and set_limit[-1][3]["time_limit"] == 6
    assert cli.session.limit_settings["time_limit"] == 6


def test_set_ratio_reaches_backend(no_unawaited_coroutines):
    cli = _cli(paradigm="fr")
    cli.menu = cli._paradigm_settings_menu()

    _select(cli, "Set Ratio")
    cli.input_value = "5"
    cli._submit_input()
    _drain(cli)

    assert ("send_command", "s1", 201, 5) in cli.api.calls
    assert cli.session.paradigm_settings["ratio"] == 5


def test_hardware_numeric_param_reaches_backend(no_unawaited_coroutines):
    cli = _cli()
    cli.menu = cli._device_menu("rh-lever")
    item = next(i for i in cli.menu.items
                if i.label.startswith("Set ") and i.label not in ("Set Active", "Set Inactive"))

    cli._run_action(item.action)
    _drain(cli)
    if cli.mode != "input":
        pytest.skip(f"{item.label} is a select-style param")
    cli.input_value = "7"
    cli._submit_input()
    _drain(cli)

    sent = [c for c in cli.api.calls if c[0] == "send_command"]
    assert sent and sent[-1][3] == 7
