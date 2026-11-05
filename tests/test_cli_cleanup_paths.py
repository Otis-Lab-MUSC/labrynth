"""Quit and firmware upload clean up even when an unexpected error escapes."""

from __future__ import annotations

import asyncio

import pytest

from cli.app import ReacherCLI
from cli.state import SessionState


class ExitRecorder:
    """Stands in for the prompt_toolkit application and records exit()."""

    def __init__(self) -> None:
        self.exited = False

    def exit(self) -> None:
        self.exited = True


class BrokenApi:
    """REST client double whose calls raise an unexpected RuntimeError."""

    async def close(self) -> None:
        raise RuntimeError("transport teardown failed")

    async def upload_firmware(self, *args: object, **kwargs: object) -> None:
        raise RuntimeError("unexpected")


def make_cli() -> ReacherCLI:
    """Build a CLI with a session and a broken API."""
    cli = ReacherCLI(port=0)
    cli.api = BrokenApi()  # type: ignore[assignment]
    cli._invalidate = lambda: None  # type: ignore[method-assign]
    cli.session = SessionState(id="abcdef0123456789", port="SIMULATOR")
    return cli


def test_quit_exits_the_app_even_when_close_raises() -> None:
    """A failing HTTP client teardown must not trap the operator in the TUI."""
    cli = make_cli()
    recorder = ExitRecorder()
    cli.app = recorder  # type: ignore[assignment]
    with pytest.raises(RuntimeError):
        asyncio.run(cli._do_quit())
    assert recorder.exited


def test_failed_upload_does_not_leave_the_session_uploading() -> None:
    """An unexpected error mid-upload resets the state before it propagates."""
    cli = make_cli()
    cli._read_local_hex = lambda paradigm, board: b""  # type: ignore[method-assign]
    with pytest.raises(RuntimeError):
        asyncio.run(cli._finish_upload("fr", "uno"))
    assert cli.session is not None
    assert cli.session.state == "idle"
