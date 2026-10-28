"""build.py reports progress through logging, with the same text as its stage messages."""

import logging
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import build  # noqa: E402


def test_validate_environment_logs_stage_header_and_ok_lines(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(build, "resolve_reacher_hex_dir", lambda: "/fake/hex")
    with caplog.at_level(logging.INFO, logger="build"):
        build.validate_environment()

    messages = [record.getMessage() for record in caplog.records]
    assert messages[0] == "\n=== Stage 0: Validate environment ==="
    assert messages[1].startswith("  [OK] reacher package (v")
    assert messages[2] == "  [OK] Firmware hex (from reacher package): /fake/hex"
    assert capsys.readouterr().out == ""


def test_validate_environment_logs_error_when_hex_missing(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(build, "resolve_reacher_hex_dir", lambda: None)
    with caplog.at_level(logging.INFO, logger="build"), pytest.raises(SystemExit) as exit_info:
        build.validate_environment()

    assert exit_info.value.code == 1
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert [r.getMessage() for r in errors] == [
        "ERROR: reacher package ships no firmware hex (reacher/hex/).",
        "       Reinstall reacher: pip install -e ../reacher",
    ]


def test_run_logs_command_and_failure(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="build"):
        build._run([sys.executable, "-c", "pass"])
    assert [r.getMessage() for r in caplog.records] == [f"  $ {sys.executable} -c pass"]

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="build"), pytest.raises(SystemExit) as exit_info:
        build._run([sys.executable, "-c", "raise SystemExit(3)"])
    assert exit_info.value.code == 3
    assert caplog.records[-1].levelno == logging.ERROR
    assert caplog.records[-1].getMessage() == "\nERROR: Command failed with exit code 3"
