"""Live monitor: WebSocket streaming and message routing for the REACHER CLI."""

from __future__ import annotations

import asyncio
import json
import time
from typing import TYPE_CHECKING

from . import presets as P
from .constants import PUMP_DEVICES
from .host import CliHost

if TYPE_CHECKING:
    pass


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
        connected_once = False
        attempt = 0

        async def _refresh_loop() -> None:
            """Redraw the screen once a second so the elapsed clock advances."""
            while True:
                await asyncio.sleep(1)
                self._invalidate()

        refresh = asyncio.ensure_future(_refresh_loop())
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
                            await self._recover_missed_events()
                            self._log("  [info] Live link restored")
                        connected_once = True
                        self._invalidate()
                        async for raw in ws:
                            try:
                                msg = json.loads(raw)
                            except json.JSONDecodeError:
                                continue
                            # A handler bug must not tear down the socket.
                            try:
                                self._handle_ws_message(msg)
                            except Exception as exc:
                                self._log(f"Bad {msg.get('type', '?')} message: {exc}", error=True)
                            self._invalidate()
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self.ws_connected = False
                    attempt += 1
                    delay = min(2 ** min(attempt - 1, 4), 15)
                    if attempt in (1, 5) or attempt % 20 == 0:
                        self._log(f"Live link down ({type(exc).__name__}: {exc}); retrying every {delay}s", error=True)
                    self._invalidate()
                    await asyncio.sleep(delay)
                    # A session the host destroyed (orphan cleanup, another
                    # client) will never accept a socket again: stop retrying.
                    if attempt % 5 == 0 and not await self._session_still_exists(sid):
                        self._log(f"Session {sid[:8]} no longer exists on {self.target_name}", error=True)
                        if self.session and self.session.id == sid:
                            self.session.state = "gone"
                        return
                else:
                    self.ws_connected = False
        except asyncio.CancelledError:
            pass
        finally:
            refresh.cancel()
            self.ws_connected = False

    async def _session_still_exists(self, sid: str) -> bool:
        """Return True if the target still lists the session (or cannot be reached)."""
        try:
            sessions = (await self.api.list_sessions()).get("sessions", [])
            return any(x.get("session_id") == sid for x in sessions)
        except Exception:
            return True  # can't tell (host unreachable) — keep trying

    async def _recover_missed_events(self) -> None:
        """Fetch events missed during a WebSocket gap, and the current state."""
        if not self.session:
            return
        try:
            info = await self.api.get_session(self.session.id)
            if info.get("state"):
                self._handle_ws_message({"type": "session_state", "data": {"state": info["state"]}})
        except Exception:
            pass
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
        except Exception as exc:
            self._log(f"Event recovery failed: {exc}", error=True)

    def _handle_ws_message(self, msg: dict, replay: bool = False) -> None:
        """Route one message. Mirrors handleMessage in web/src/hooks/useSessionWebSockets.ts.

        ``replay`` is set for events fetched over REST (attach / gap recovery):
        they update counters but must not re-trigger side effects.
        """
        msg_type = msg.get("type", "")
        data = msg.get("data", msg)
        s = self.session
        if s and msg.get("session_id") not in (None, s.id):
            return

        if msg_type == "event":
            device = str(data.get("device", ""))
            event = str(data.get("event", ""))
            ts = data.get("start_timestamp", data.get("timestamp", ""))
            if isinstance(ts, (int, float)):
                ts = f"{ts / 1000:9.1f}s"
            extra = f" ({data['trial_type']})" if data.get("trial_type") else ""
            if not replay:
                self._log(f"[{ts}]  {device:<16} {event}{extra}")
            if s:
                if not replay:
                    s.backend_event_count += 1
                dev = device.upper()
                evt = event.upper()
                if dev in PUMP_DEVICES and evt == "INFUSION":
                    s.infusion_count += 1
                elif dev in ("RH_LEVER", "LEVER_RH", "LH_LEVER", "LEVER_LH") and "PRESS" in evt:
                    s.press_count += 1
                    counts = s.rh_counts if dev in ("RH_LEVER", "LEVER_RH") else s.lh_counts
                    for name in ("active", "timeout", "inactive"):
                        if evt == f"{name.upper()}_PRESS":
                            counts[name] = counts.get(name, 0) + 1
                elif dev == "PAVLOV" and evt == "TRIAL_START":
                    s.trial_count += 1
                    if data.get("trial_type") == "CS_PLUS":
                        s.cs_plus_count += 1
                    elif data.get("trial_type") == "CS_MINUS":
                        s.cs_minus_count += 1
                if dev == "CONTROLLER" and evt == "END" and not replay:
                    s.state = "stopped"
                    s.program_end = time.time()
                    self._auto_export()

        elif msg_type == "frame":
            if s:
                s.frame_count += 1

        elif msg_type == "infusion_count":
            if s:
                s.server_infusion_count = data.get("counted")
                s.infusions_by_pump = data.get("by_pump")

        elif msg_type == "session_state":
            state = data.get("state", "")
            if s and state:
                prev = s.state
                s.state = state
                if state == "running" and s.program_start is None and not s.attached:
                    s.program_start = time.time()
                elif state == "stopped" and prev != "stopped":
                    s.program_end = time.time()
                if state != prev:
                    self._log(f"  [state] {prev} -> {state}")
                    self._rebuild_current_menu()

        elif msg_type == "config":
            # One record per device: {"device": "LEVER_RH", "armed": true, ...}.
            if s:
                P.merge_firmware_row(s.hw, data)
                P.merge_controller_row(s.paradigm_settings, data)

        elif msg_type == "error":
            self._log(f"  [error] [{data.get('device', '?')}] {data.get('desc', data)}", error=True)

        elif msg_type == "upload_progress":
            self._log(f"  [upload] {data.get('stage', '')} ({data.get('percent', '?')}%)")
            self._set_status(f"Upload: {data.get('stage', '')} ({data.get('percent', '?')}%)")

        elif msg_type == "disconnect":
            if s:
                s.state = "disconnected"
            reason = data.get("reason", "unknown")
            suffix = " (reconnecting...)" if data.get("reconnecting") else ""
            self._log(f"  [error] Serial disconnected: {reason}{suffix}", error=True)
            self._set_status(f"Serial disconnected on {self.target_name}: {reason}{suffix}", error=True)

        elif msg_type == "reconnected":
            attempt = data.get("attempt", "?")
            self._log(f"  [info] Serial reconnected (attempt {attempt})")
            self._set_status(f"Serial reconnected on {self.target_name} (attempt {attempt})")

        elif msg_type == "warning":
            text = data.get("message")
            if not text and data.get("reason"):
                where = data.get("thread") or data.get("log_type")
                text = f"{data['reason']} ({where})" if where else data["reason"]
            text = f"Kernel warning: {text}" if text else "Kernel warning"
            self._log(f"  [warn] {text}", error=True)
            self._set_status(text, error=True)

        elif msg_type in ("export_failed", "kernel_error"):
            label = "Auto-export failed" if msg_type == "export_failed" else "Kernel error"
            self._log(f"  [error] {label}: {data.get('reason', data)}", error=True)
            self._set_status(f"{label}: {data.get('reason', '')}", error=True)

        elif msg_type == "split":
            seg = data.get("segment_number", 0)
            self._log(f"  [split] Segment split — now on segment {int(seg) + 1}")

        elif msg_type == "restart":
            if s:
                s.state = "running"
                s.program_start = time.time()
                s.program_end = None
                s.paused_time = 0
                s.pause_start = None
                s.attached = False
                self._reset_counters()
            self._log("  [restart] Program restarted")

        elif msg_type in ("server_suspended", "session_orphaned"):
            mins = round(int(data.get("hard_kill_in", 0)) / 60)
            what = (
                "Server suspended (idle watchdog)"
                if msg_type == "server_suspended"
                else "Session orphaned — the host saw no connected client during the run"
            )
            self._log(f"  [warn] {what}. Host shuts down in ~{mins} min unless a client reconnects.", error=True)
            if s and s.behavior_count_hint():
                self._auto_export()

        elif msg_type == "server_resumed":
            self._log("  [info] Server resumed")

        elif msg_type == "log":
            level = data.get("level", "info")
            text = data.get("message", str(data))
            self._log(f"  [{level}] {text}", error=level in ("error", "critical"))

        elif msg_type != "pong":
            self._log(f"  [?] Unhandled message type: {msg_type}")
