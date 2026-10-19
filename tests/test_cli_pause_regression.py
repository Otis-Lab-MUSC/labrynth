"""Known-bug test: pausing a running CLI session must show paused, not resumed.

Run from the repo root (CLI extras importable: prompt_toolkit, httpx, websockets):

    python -m unittest discover -s tests -v

Defect (desk #3, CLI-1): the backend pauses, but the CLI header stays
``running`` and the status line says ``Session resumed``.

reacher's pause route pauses a running program, broadcasts ``session_state``
``paused`` on the websocket, and only then returns the HTTP body. The CLI
applies that broadcast on the same event loop while ``pause_program`` is
still awaited, so a toggle that reads ``session.state`` after the await sees
the post-pause state and takes the resume branch.

This module fakes that backend and that socket. It never opens a serial port
and never starts a reacher process. ``_pause_program`` does not branch on
paradigm; each shipped paradigm is still exercised because the defect was
reported on every paradigm that was tried.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cli.app import ReacherCLI, SessionState  # noqa: E402

# Paradigms the CLI offers when firmware discovery is unavailable
# (cli/app.py upload fallback). Pause is the same path for each of them.
PARADIGMS = ("fr", "pr", "vi", "omission", "pavlovian")


def _header_line(cli: ReacherCLI) -> str:
    """Top status line, e.g. ``REACHER CLI  @ this machine  [running]``."""
    parts: list[str] = []
    for _style, fragment in cli._render():
        if "\n" in fragment:
            parts.append(fragment.split("\n", 1)[0])
            break
        parts.append(fragment)
    return "".join(parts)


class _FakePauseBackend:
    """In-memory pause route and the websocket broadcast that precedes its response.

    The live reader (``ReacherCLI._stream_events``) does ``json.loads`` then
    ``_handle_ws_message``. This fake does the same on a separate task and does
    not resolve the POST until that handler has applied the message.
    """

    def __init__(self, cli: ReacherCLI):
        self.cli = cli
        self.calls: list[str] = []
        self._reader: asyncio.Task | None = None
        self._inbox: asyncio.Queue[str] = asyncio.Queue()

    async def start(self) -> None:
        self._reader = asyncio.create_task(self._read_socket())
        await asyncio.sleep(0)

    async def stop(self) -> None:
        if self._reader is None:
            return
        self._reader.cancel()
        try:
            await self._reader
        except asyncio.CancelledError:
            pass
        self._reader = None

    async def _read_socket(self) -> None:
        while True:
            raw = await self._inbox.get()
            try:
                msg = json.loads(raw)
                self.cli._handle_ws_message(msg)
            finally:
                self._inbox.task_done()

    async def pause_program(self, sid: str) -> dict:
        self.calls.append(sid)
        # Running program: backend pauses and broadcasts before the HTTP response.
        await self._inbox.put(json.dumps({
            "type": "session_state",
            "session_id": sid,
            "data": {"state": "paused"},
        }))
        await self._inbox.join()
        return {"status": "paused"}


class CliPauseRegressionTest(unittest.TestCase):
    def test_pause_from_running_shows_paused_state_header_and_status(self):
        for paradigm in PARADIGMS:
            with self.subTest(paradigm=paradigm):
                asyncio.run(self._pause_running_session(paradigm))

    async def _pause_running_session(self, paradigm: str) -> None:
        cli = ReacherCLI()
        real_api = cli.api
        backend = _FakePauseBackend(cli)
        # Drop the real HTTP client so a stray call cannot reach localhost:6229.
        cli.api = backend
        try:
            await backend.start()
            cli.session = SessionState(
                id=f"sess-{paradigm}",
                port="SIM1",
                paradigm=paradigm,
                state="running",
                program_start=time.time(),
            )
            cli.ws_connected = True
            cli.menu = cli._program_menu()

            pause = next((item for item in cli.menu.items if item.label == "Pause Session"), None)
            self.assertIsNotNone(
                pause, f"{paradigm}: a running session must offer Pause Session",
            )
            await pause.action()

            self.assertEqual(
                backend.calls,
                [cli.session.id],
                f"{paradigm}: pause must hit the backend once for this session",
            )

            header = _header_line(cli)
            labels = [item.label for item in cli.menu.items]
            shows_paused = (
                cli.session.state == "paused"
                and "[paused]" in header
                and "[running]" not in header
                and cli.status_message == "Session paused"
                and "Play (Resume)" in labels
                and "Pause Session" not in labels
            )
            self.assertTrue(
                shows_paused,
                "pausing a running session left the CLI showing the inverted state:\n"
                f"  paradigm: {paradigm}\n"
                f"  state: {cli.session.state!r} (expected 'paused')\n"
                f"  header: {header!r} (expected to contain '[paused]')\n"
                f"  status: {cli.status_message!r} (expected 'Session paused')\n"
                f"  program menu: {labels}",
            )
        finally:
            await backend.stop()
            await real_api.close()


if __name__ == "__main__":
    unittest.main()
