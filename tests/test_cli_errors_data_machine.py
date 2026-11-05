"""Narrowed exception handling in the data, machine, attach and firmware actions."""

from __future__ import annotations

import asyncio
import sys
import types
from pathlib import Path

import httpx
import pytest

from cli.app import ReacherCLI, SessionState


class FakeApp:
    def create_background_task(self, coro):
        coro.close()

    def invalidate(self):
        pass


class FailingApi:
    """Fake API whose calls all raise the configured exception."""

    def __init__(self, exc: Exception):
        self.exc = exc
        self.device_id = None

    async def list_machines(self):
        raise self.exc

    async def set_file_config(self, sid, **kw):
        raise self.exc


def _cli(exc: Exception) -> ReacherCLI:
    cli = ReacherCLI()
    cli.api = FailingApi(exc)
    cli.app = FakeApp()
    cli.session = SessionState(id="s1", port="/dev/null", paradigm="fr", state="idle")
    return cli


def test_connect_error_is_shown_in_status() -> None:
    cli = _cli(httpx.ConnectError("refused"))
    asyncio.run(cli._set_filename("x"))
    assert cli.status_is_error
    assert "refused" in cli.status_message


def test_machine_refresh_connect_error_clears_list() -> None:
    cli = _cli(httpx.ConnectError("down"))
    asyncio.run(cli._refresh_machines())
    assert cli.machines == []
    assert cli.status_is_error


def test_unexpected_error_propagates() -> None:
    cli = _cli(RuntimeError("bug"))
    with pytest.raises(RuntimeError):
        asyncio.run(cli._set_filename("x"))
    with pytest.raises(RuntimeError):
        asyncio.run(cli._refresh_machines())


def _install_uploader(monkeypatch: pytest.MonkeyPatch, path: str, exc: Exception | None = None) -> None:
    class FirmwareUploader:
        def get_hex_path(self, paradigm: str, board: str) -> str:
            if exc:
                raise exc
            return path

    module = types.ModuleType("reacher.uploader")
    module.FirmwareUploader = FirmwareUploader  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "reacher", types.ModuleType("reacher"))
    monkeypatch.setitem(sys.modules, "reacher.uploader", module)


def test_hex_read_missing_file_returns_none(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _install_uploader(monkeypatch, str(tmp_path / "absent.hex"))
    assert ReacherCLI()._read_local_hex("fr", "uno") is None


def test_hex_read_returns_base64(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    hex_file = tmp_path / "a.hex"
    hex_file.write_bytes(b"abc")
    _install_uploader(monkeypatch, str(hex_file))
    assert ReacherCLI()._read_local_hex("fr", "uno") == "YWJj"


def test_hex_read_unrelated_error_propagates(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _install_uploader(monkeypatch, "", exc=RuntimeError("bug"))
    with pytest.raises(RuntimeError):
        ReacherCLI()._read_local_hex("fr", "uno")
