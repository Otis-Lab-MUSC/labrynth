"""Live monitor: WebSocket streaming and message routing for the REACHER CLI."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterable

from .errors import API_ERRORS
from .host import CliHost


class MonitorMixin(CliHost):
    """Live monitor actions, mixed into ``ReacherCLI``."""

    async def _enter_monitor(self) -> None:
        """Switch to the live monitor, starting the WebSocket if needed."""
        if not self.session:
            self._set_status("No session — create one first", error=True)
            return
        self.mode = "monitor"
        self._ensure_ws()
        self._invalidate()

    async def _exit_monitor(self) -> None:
        """Leave the live monitor; the WebSocket stays open."""
        # The socket deliberately stays open: it is what keeps counters, state
        # and the host's idle watchdog current while the operator is in menus.
        self.mode = "menu"
        self._rebuild_current_menu()
        self._invalidate()

    def _ensure_ws(self) -> None:
        """Start the session's background WebSocket if it is not running."""
        if not self.session or (self._ws_task and not self._ws_task.done()):
            return
        self._ws_task = asyncio.ensure_future(self._stream_events(self.session.id))

    def _stop_ws(self) -> None:
        """Cancel the background WebSocket task."""
        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()
        self._ws_task = None
        self.ws_connected = False

    def _log(self, text: str, error: bool = False) -> None:
        """Append a line to the monitor feed, keeping the most recent 500."""
        self.monitor_lines.append(("class:status-bar-error" if error else "class:monitor-event", text))
        del self.monitor_lines[:-500]

    async def _stream_events(self, sid: str) -> None:
        """Follow the session's WebSocket, reconnecting with backoff, until the session changes or disappears."""
        try:
            import websockets
        except ImportError:
            self._log("websockets not installed — cannot stream", error=True)
            self._invalidate()
            return

        # Local: /ws/{sid}?token=<key>. Remote: the local backend's relay,
        # /api/proxy/{device}/ws/{sid}?token=<LOCAL key>. The backend rejects
        # a socket without the token (403 before any session lookup).
        stream_errors = (OSError, websockets.exceptions.WebSocketException, asyncio.TimeoutError, ValueError)
        connected_once = False
        attempt = 0
        refresh = asyncio.ensure_future(self._refresh_loop())
        try:
            # Retries forever with capped backoff: for a walk-away run the
            # live link must come back on its own after a Wi-Fi blip or a
            # controller sleep, rather than give up after a fixed count.
            while self.session and self.session.id == sid:
                try:
                    async with websockets.connect(self.api.ws_url(sid), open_timeout=15) as ws:
                        attempt = 0
                        self.ws_connected = True
                        if connected_once:
                            # The backend accepts a socket for a session it has
                            # destroyed, so a successful handshake proves nothing.
                            if await self._abandon_if_session_gone(sid):
                                return
                            await self._recover_missed_events()
                            self._log("  [info] Live link restored")
                        connected_once = True
                        self._invalidate()
                        await self._read_socket(ws)
                except asyncio.CancelledError:
                    raise
                except stream_errors as exc:
                    attempt += 1
                    if await self._handle_link_down(exc, attempt, sid):
                        return
                else:
                    self.ws_connected = False
        except asyncio.CancelledError:
            pass
        finally:
            refresh.cancel()
            self.ws_connected = False

    async def _refresh_loop(self) -> None:
        """Redraw the screen once a second so the elapsed clock advances."""
        while True:
            await asyncio.sleep(1)
            self._invalidate()

    async def _read_socket(self, ws: AsyncIterable[str | bytes]) -> None:
        """Route every message from the open socket into the session."""
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            # A handler bug must not tear down the socket.
            try:
                self._handle_ws_message(msg)
            except Exception as exc:  # noqa: BLE001 -- handler guard: a handler bug must not tear down the socket
                self._log(f"Bad {msg.get('type', '?')} message: {exc}", error=True)
            self._invalidate()

    async def _handle_link_down(self, exc: Exception, attempt: int, sid: str) -> bool:
        """Back off after a dropped link; return True when the session is gone for good."""
        self.ws_connected = False
        delay = min(2 ** min(attempt - 1, 4), 15)
        if attempt in (1, 5) or attempt % 20 == 0:
            self._log(f"Live link down ({type(exc).__name__}: {exc}); retrying every {delay}s", error=True)
        self._invalidate()
        await asyncio.sleep(delay)
        # A session the host destroyed (orphan cleanup, another client) will
        # never accept a socket again: stop retrying.
        return attempt % 5 == 0 and await self._abandon_if_session_gone(sid)

    async def _abandon_if_session_gone(self, sid: str) -> bool:
        """Mark the session gone and return True when the target does not list it."""
        if await self._session_still_exists(sid):
            return False
        self._log(f"Session {sid[:8]} no longer exists on {self.target_name}", error=True)
        if self.session and self.session.id == sid:
            self.session.state = "gone"
        return True

    async def _session_still_exists(self, sid: str) -> bool:
        """Return True if the target still lists the session (or cannot be reached)."""
        try:
            sessions = (await self.api.list_sessions()).get("sessions", [])
            return any(x.get("session_id") == sid for x in sessions)
        except API_ERRORS:
            return True  # can't tell (host unreachable) — keep trying

    async def _recover_missed_events(self) -> None:
        """Fetch events missed during a WebSocket gap, and the current state."""
        if not self.session:
            return
        try:
            info = await self.api.get_session(self.session.id)
            if info.get("state"):
                self._handle_ws_message({"type": "session_state", "data": {"state": info["state"]}})
        except API_ERRORS as exc:
            self._log(f"State refresh failed: {exc}", error=True)
        try:
            since = self.session.backend_event_count
            resp = await self.api.get_behavior(self.session.id, since=since)
            data = resp.get("data", [])
            total = resp.get("total", 0)
            if total < since:
                # Buffers were reset (restart/new run): replay from zero.
                self._reset_counters()
                resp = await self.api.get_behavior(self.session.id)
                data, total = resp.get("data", []), resp.get("total", 0)
            for entry in data:
                self._handle_ws_message({"type": "event", "data": entry}, replay=True)
            self.session.backend_event_count = total
            if data:
                self._log(f"  [info] Recovered {len(data)} missed events")
        except API_ERRORS as exc:
            self._log(f"Event recovery failed: {exc}", error=True)
