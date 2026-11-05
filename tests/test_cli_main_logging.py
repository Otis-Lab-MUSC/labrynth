"""Diagnostics from ``cli.__main__`` go to logging; the selftest result stays on stdout."""

from __future__ import annotations

import argparse
import logging

import pytest

from cli import __main__ as entry


def _args(no_server: bool = False, port: int = 6229) -> argparse.Namespace:
    """Build the parsed-arguments namespace used by ``_ensure_backend``."""
    return argparse.Namespace(no_server=no_server, port=port)


def test_already_running_is_logged_not_printed(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    """An existing backend is reported through logging only."""
    monkeypatch.setattr(entry, "_is_running", lambda port: True)
    with caplog.at_level(logging.INFO, logger=entry.LOGGER.name):
        entry._ensure_backend(_args())
    assert "Backend already running on port 6229." in caplog.text
    assert capsys.readouterr().out == ""


def test_spawn_and_ready_are_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    """Starting and readiness messages are log records, not stdout."""
    monkeypatch.setattr(entry, "_is_running", lambda port: False)
    monkeypatch.setattr(
        entry, "_spawn_backend", lambda port: entry.LOGGER.info("Starting REACHER backend on port %s...", port)
    )
    monkeypatch.setattr(entry, "_wait_for_server", lambda port: True)
    with caplog.at_level(logging.INFO, logger=entry.LOGGER.name):
        entry._ensure_backend(_args())
    assert "Starting REACHER backend on port 6229..." in caplog.text
    assert "Backend ready." in caplog.text
    assert capsys.readouterr().out == ""


def test_startup_failure_logs_error_and_exits(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    """A backend that never comes up logs an error record and exits non-zero."""
    monkeypatch.setattr(entry, "_is_running", lambda port: False)
    monkeypatch.setattr(entry, "_spawn_backend", lambda port: None)
    monkeypatch.setattr(entry, "_wait_for_server", lambda port: False)
    with caplog.at_level(logging.INFO, logger=entry.LOGGER.name), pytest.raises(SystemExit) as exit_info:
        entry._ensure_backend(_args())
    assert exit_info.value.code == 1
    assert any(r.levelno == logging.ERROR and "failed to start" in r.getMessage() for r in caplog.records)
    assert capsys.readouterr().out == ""


def test_selftest_prints_result_to_stdout(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    """The selftest result line is machine-read and stays on stdout."""
    monkeypatch.delenv("REACHER_RUN_BACKEND", raising=False)
    monkeypatch.setattr("sys.argv", ["cli", "--selftest"])
    entry.main()
    captured = capsys.readouterr()
    assert captured.out.strip() == "selftest OK"


def test_backend_trampoline_emits_nothing_on_stdout(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The frozen-bundle backend trampoline skips argument parsing and writes no log noise."""
    called: list[bool] = []
    monkeypatch.setenv("REACHER_RUN_BACKEND", "1")
    monkeypatch.setattr(entry, "_run_backend", lambda: called.append(True))
    entry.main()
    assert called == [True]
    assert capsys.readouterr().out == ""
