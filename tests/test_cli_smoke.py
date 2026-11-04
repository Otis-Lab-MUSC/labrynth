"""Smoke tests for ReacherCLI: every menu builds, every WebSocket message type routes.

These pin current behaviour so ``cli/app.py`` can be split into modules without
changing what the CLI does. No prompt_toolkit Application is started and no
backend is contacted.
"""

from __future__ import annotations

import pytest

from cli.app import DEVICE_CONFIGS, MenuState, ReacherCLI, SessionState

PARADIGMS = ("fr", "pr", "vi", "omission", "pavlovian")
SESSION_ID = "s1"
MENU_BUILDERS = (
    "_main_menu",
    "_session_menu",
    "_hardware_menu",
    "_program_menu",
    "_preset_menu",
    "_paradigm_settings_menu",
    "_pavlovian_menu",
    "_limits_menu",
    "_monitor_menu",
    "_data_menu",
    "_machines_menu",
)


class RecordingApp:
    """Stands in for the prompt_toolkit Application."""

    def __init__(self) -> None:
        self.invalidations = 0

    def invalidate(self) -> None:
        self.invalidations += 1


def make_cli(paradigm: str | None = "fr", state: str = "running") -> ReacherCLI:
    """Return a CLI holding one session and a fake app."""
    cli = ReacherCLI()
    cli.app = RecordingApp()  # type: ignore[assignment]
    cli.session = SessionState(id=SESSION_ID, port="/dev/null", paradigm=paradigm, state=state)
    return cli


def session_of(cli: ReacherCLI) -> SessionState:
    """Return the CLI's session, which every test that calls this has set."""
    assert cli.session is not None
    return cli.session


def send(cli: ReacherCLI, msg_type: str, data: dict[str, object], replay: bool = False) -> None:
    """Route one message the way the live reader does."""
    cli._handle_ws_message({"type": msg_type, "session_id": SESSION_ID, "data": data}, replay=replay)


def log_text(cli: ReacherCLI) -> str:
    """Return every monitor line as one string."""
    return "\n".join(text for _style, text in cli.monitor_lines)


def screen_text(cli: ReacherCLI) -> str:
    """Return the rendered screen as plain text."""
    return "".join(fragment[1] for fragment in cli._render())


@pytest.mark.parametrize("paradigm", PARADIGMS)
@pytest.mark.parametrize("builder", MENU_BUILDERS)
def test_menu_builds_for_every_paradigm(builder: str, paradigm: str) -> None:
    menu = getattr(make_cli(paradigm), builder)()
    assert isinstance(menu, MenuState)
    assert menu.items
    assert all(item.label for item in menu.items)


@pytest.mark.parametrize("builder", MENU_BUILDERS)
def test_menu_builds_without_a_session(builder: str) -> None:
    cli = ReacherCLI()
    assert getattr(cli, builder)().items


@pytest.mark.parametrize("config", DEVICE_CONFIGS, ids=[c["id"] for c in DEVICE_CONFIGS])
def test_device_menu_builds_for_every_device(config: dict[str, object]) -> None:
    menu = make_cli()._device_menu(str(config["id"]))
    assert menu.items[-1].label == "Back"


def test_every_menu_ends_with_a_working_back_item_or_quit() -> None:
    cli = make_cli()
    for builder in MENU_BUILDERS:
        labels = [item.label for item in getattr(cli, builder)().items]
        assert labels[-1] in ("Back", "Quit"), builder


def test_menu_screen_renders_for_each_mode() -> None:
    cli = make_cli()
    for mode in ("menu", "input", "select", "monitor"):
        cli.mode = mode
        assert screen_text(cli)


def test_event_message_counts_infusions_and_logs_it() -> None:
    cli = make_cli()
    send(cli, "event", {"device": "PUMP_1", "event": "INFUSION", "timestamp": 1500})
    assert session_of(cli).infusion_count == 1
    assert session_of(cli).backend_event_count == 1
    assert "PUMP_1" in log_text(cli)


def test_event_message_counts_lever_presses_by_kind() -> None:
    cli = make_cli()
    send(cli, "event", {"device": "RH_LEVER", "event": "ACTIVE_PRESS"})
    send(cli, "event", {"device": "LH_LEVER", "event": "INACTIVE_PRESS"})
    assert session_of(cli).press_count == 2
    assert session_of(cli).rh_counts["active"] == 1
    assert session_of(cli).lh_counts["inactive"] == 1


def test_event_message_counts_pavlovian_trials() -> None:
    cli = make_cli("pavlovian")
    send(cli, "event", {"device": "PAVLOV", "event": "TRIAL_START", "trial_type": "CS_PLUS"})
    send(cli, "event", {"device": "PAVLOV", "event": "TRIAL_START", "trial_type": "CS_MINUS"})
    assert (session_of(cli).trial_count, session_of(cli).cs_plus_count, session_of(cli).cs_minus_count) == (2, 1, 1)


def test_replayed_event_counts_but_does_not_log_or_bump_backend_count() -> None:
    cli = make_cli()
    send(cli, "event", {"device": "PUMP_1", "event": "INFUSION"}, replay=True)
    assert session_of(cli).infusion_count == 1
    assert session_of(cli).backend_event_count == 0
    assert not cli.monitor_lines


def test_controller_end_stops_the_session_and_triggers_export(monkeypatch: pytest.MonkeyPatch) -> None:
    cli = make_cli()
    exports: list[bool] = []
    monkeypatch.setattr(cli, "_auto_export", lambda: exports.append(True))
    send(cli, "event", {"device": "CONTROLLER", "event": "END"})
    assert session_of(cli).state == "stopped"
    assert session_of(cli).program_end is not None
    assert exports == [True]


def test_replayed_controller_end_has_no_side_effects(monkeypatch: pytest.MonkeyPatch) -> None:
    cli = make_cli()
    monkeypatch.setattr(cli, "_auto_export", lambda: pytest.fail("export on replay"))
    send(cli, "event", {"device": "CONTROLLER", "event": "END"}, replay=True)
    assert session_of(cli).state == "running"


def test_frame_message_counts_frames() -> None:
    cli = make_cli()
    send(cli, "frame", {})
    assert session_of(cli).frame_count == 1


def test_infusion_count_message_records_server_totals() -> None:
    cli = make_cli()
    send(cli, "infusion_count", {"counted": 7, "by_pump": {"PUMP_1": 7}})
    assert session_of(cli).server_infusion_count == 7
    assert session_of(cli).infusions_by_pump == {"PUMP_1": 7}


def test_session_state_message_updates_state_and_start_time() -> None:
    cli = make_cli(state="connected")
    send(cli, "session_state", {"state": "running"})
    assert session_of(cli).state == "running"
    assert session_of(cli).program_start is not None
    assert "connected -> running" in log_text(cli)


def test_attached_session_does_not_restamp_program_start() -> None:
    cli = make_cli(state="connected")
    session_of(cli).attached = True
    send(cli, "session_state", {"state": "running"})
    assert session_of(cli).program_start is None


def test_disconnect_message_marks_session_and_reports_reason() -> None:
    cli = make_cli()
    send(cli, "disconnect", {"reason": "cable", "reconnecting": True})
    assert session_of(cli).state == "disconnected"
    assert cli.status_is_error
    assert "cable (reconnecting...)" in cli.status_message


def test_reconnected_message_reports_attempt() -> None:
    cli = make_cli()
    send(cli, "reconnected", {"attempt": 3})
    assert "attempt 3" in cli.status_message


def test_error_message_is_logged_as_error() -> None:
    cli = make_cli()
    send(cli, "error", {"device": "PUMP_1", "desc": "jammed"})
    assert cli.monitor_lines[-1] == ("class:status-bar-error", "  [error] [PUMP_1] jammed")


def test_upload_progress_message_sets_status() -> None:
    cli = make_cli()
    send(cli, "upload_progress", {"stage": "flashing", "percent": 40})
    assert cli.status_message == "Upload: flashing (40%)"


def test_warning_message_builds_text_from_reason_and_thread() -> None:
    cli = make_cli()
    send(cli, "warning", {"reason": "slow", "thread": "reader"})
    assert cli.status_message == "Kernel warning: slow (reader)"
    assert cli.status_is_error


@pytest.mark.parametrize(
    ("msg_type", "label"),
    [("export_failed", "Auto-export failed"), ("kernel_error", "Kernel error")],
)
def test_failure_messages_name_the_failure(msg_type: str, label: str) -> None:
    cli = make_cli()
    send(cli, msg_type, {"reason": "disk full"})
    assert cli.status_message == f"{label}: disk full"


def test_split_message_logs_next_segment() -> None:
    cli = make_cli()
    send(cli, "split", {"segment_number": 2})
    assert "segment 3" in log_text(cli)


def test_restart_message_resets_counters_and_clock() -> None:
    cli = make_cli(state="paused")
    session_of(cli).infusion_count = 9
    session_of(cli).paused_time = 12
    send(cli, "restart", {})
    assert session_of(cli).state == "running"
    assert session_of(cli).infusion_count == 0
    assert session_of(cli).paused_time == 0
    assert session_of(cli).program_end is None


@pytest.mark.parametrize("msg_type", ["server_suspended", "session_orphaned"])
def test_suspension_messages_warn_and_export_only_when_events_seen(
    msg_type: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    cli = make_cli()
    exports: list[bool] = []
    monkeypatch.setattr(cli, "_auto_export", lambda: exports.append(True))
    send(cli, msg_type, {"hard_kill_in": 600})
    assert "~10 min" in log_text(cli)
    assert exports == []
    session_of(cli).backend_event_count = 1
    send(cli, msg_type, {"hard_kill_in": 600})
    assert exports == [True]


def test_log_message_level_is_shown() -> None:
    cli = make_cli()
    send(cli, "log", {"level": "warning", "message": "heads up"})
    assert "[warning] heads up" in log_text(cli)


def test_unknown_message_type_is_reported_but_pong_is_silent() -> None:
    cli = make_cli()
    send(cli, "pong", {})
    assert not cli.monitor_lines
    send(cli, "mystery", {})
    assert "Unhandled message type: mystery" in log_text(cli)


def test_message_for_another_session_is_ignored() -> None:
    cli = make_cli()
    cli._handle_ws_message({"type": "frame", "session_id": "other", "data": {}})
    assert session_of(cli).frame_count == 0


def test_messages_without_a_session_do_not_raise() -> None:
    cli = ReacherCLI()
    for msg_type in ("event", "frame", "infusion_count", "session_state", "config", "disconnect", "restart"):
        cli._handle_ws_message(
            {"type": msg_type, "data": {"device": "PUMP_1", "event": "INFUSION", "state": "running"}}
        )
