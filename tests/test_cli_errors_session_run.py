"""Backend errors are shown in the status line; unexpected errors propagate."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from cli.app import ReacherCLI, SessionState


class FailingApi:
    """Fake API whose calls raise the configured exception."""

    def __init__(self, error: Exception) -> None:
        self.error = error

    async def connect_serial(self, sid: str) -> None:
        raise self.error

    async def stop_program(self, sid: str) -> dict[str, str]:
        raise self.error

    async def split_segment(self, sid: str) -> dict[str, str]:
        raise self.error

    async def list_ports(self) -> dict[str, list[str]]:
        raise self.error


def _cli(error: Exception) -> tuple[ReacherCLI, list[tuple[str, bool]]]:
    """Build a CLI with a failing fake API and a recorded status log."""
    cli = ReacherCLI()
    cli.api = FailingApi(error)  # type: ignore[assignment]
    cli.session = SessionState(id="s1", port="/dev/null", paradigm="fr", state="running")
    statuses: list[tuple[str, bool]] = []
    cli._set_status = lambda msg, error=False: statuses.append((msg, error))  # type: ignore[method-assign]
    return cli, statuses


def test_connect_error_is_shown_as_status() -> None:
    """A ConnectError during connect becomes an error status."""
    cli, statuses = _cli(httpx.ConnectError("refused"))
    asyncio.run(cli._connect())
    assert statuses == [("Connect failed: refused", True)]


def test_stop_error_is_shown_as_status() -> None:
    """A ConnectError during stop becomes an error status."""
    cli, statuses = _cli(httpx.ConnectError("refused"))
    asyncio.run(cli._confirm_stop("yes"))
    assert statuses == [("Stop failed: refused", True)]


def test_unexpected_error_propagates_from_connect() -> None:
    """A RuntimeError is not swallowed by the connect action."""
    cli, statuses = _cli(RuntimeError("bug"))
    with pytest.raises(RuntimeError):
        asyncio.run(cli._connect())
    assert statuses == []


def test_unexpected_error_propagates_from_split() -> None:
    """A RuntimeError is not swallowed by the split action."""
    cli, _ = _cli(RuntimeError("bug"))
    with pytest.raises(RuntimeError):
        asyncio.run(cli._split_segment())
