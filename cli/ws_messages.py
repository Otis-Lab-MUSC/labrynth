"""WebSocket message routing for the REACHER CLI."""

from __future__ import annotations

import time

from . import presets as P
from .constants import PUMP_DEVICES
from .host import CliHost

WsData = dict[str, object]


def _to_int(value: object) -> int:
    """Convert a numeric payload value to int, or 0 when it is not numeric."""
    return int(value) if isinstance(value, (int, float, str)) else 0


WS_HANDLER_NAMES = {
    "frame": "_ws_frame",
    "infusion_count": "_ws_infusion_count",
    "session_state": "_ws_session_state",
    "config": "_ws_config",
    "error": "_ws_error",
    "upload_progress": "_ws_upload_progress",
    "disconnect": "_ws_disconnect",
    "reconnected": "_ws_reconnected",
    "warning": "_ws_warning",
    "split": "_ws_split",
    "restart": "_ws_restart",
    "server_resumed": "_ws_resumed",
    "log": "_ws_log",
}


class WsMessageMixin(CliHost):
    """Routes WebSocket messages into session state, mixed into ``ReacherCLI``."""

    def _handle_ws_message(self, msg: WsData, replay: bool = False) -> None:
        """Route one message. Mirrors handleMessage in web/src/hooks/useSessionWebSockets.ts.

        ``replay`` is set for events fetched over REST (attach / gap recovery):
        they update counters but must not re-trigger side effects.
        """
        msg_type = msg.get("type", "")
        raw = msg.get("data", msg)
        data: WsData = raw if isinstance(raw, dict) else msg
        s = self.session
        if s and msg.get("session_id") not in (None, s.id):
            return
        if msg_type == "event":
            self._ws_event(data, replay)
        elif msg_type in WS_HANDLER_NAMES:
            getattr(self, WS_HANDLER_NAMES[msg_type])(data)
        elif msg_type in ("export_failed", "kernel_error"):
            self._ws_failure(msg_type, data)
        elif msg_type in ("server_suspended", "session_orphaned"):
            self._ws_suspended(msg_type, data)
        elif msg_type != "pong":
            self._log(f"  [?] Unhandled message type: {msg_type}")

    def _ws_event(self, data: WsData, replay: bool) -> None:
        """Log a behaviour event and update the session counters."""
        device = str(data.get("device", ""))
        event = str(data.get("event", ""))
        ts = data.get("start_timestamp", data.get("timestamp", ""))
        if isinstance(ts, (int, float)):
            ts = f"{ts / 1000:9.1f}s"
        extra = f" ({data['trial_type']})" if data.get("trial_type") else ""
        if not replay:
            self._log(f"[{ts}]  {device:<16} {event}{extra}")
        s = self.session
        if not s:
            return
        if not replay:
            s.backend_event_count += 1
        dev = device.upper()
        evt = event.upper()
        self._count_event(dev, evt, data)
        if dev == "CONTROLLER" and evt == "END" and not replay:
            s.state = "stopped"
            s.program_end = time.time()
            self._auto_export()

    def _count_event(self, dev: str, evt: str, data: WsData) -> None:
        """Increment infusion, press and trial counters for one event."""
        s = self.session
        if s is None:
            return
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

    def _ws_frame(self, data: WsData) -> None:
        """Count one camera frame."""
        if self.session:
            self.session.frame_count += 1

    def _ws_infusion_count(self, data: WsData) -> None:
        """Store the server-side infusion totals."""
        s = self.session
        if s:
            counted = data.get("counted")
            by_pump = data.get("by_pump")
            s.server_infusion_count = counted if isinstance(counted, int) else None
            s.infusions_by_pump = by_pump if isinstance(by_pump, dict) else None

    def _ws_session_state(self, data: WsData) -> None:
        """Apply a session state change and rebuild the menu."""
        s = self.session
        state = data.get("state", "")
        if not (s and isinstance(state, str) and state):
            return
        prev = s.state
        s.state = state
        if state == "running" and s.program_start is None and not s.attached:
            s.program_start = time.time()
        elif state == "stopped" and prev != "stopped":
            s.program_end = time.time()
        if state != prev:
            self._log(f"  [state] {prev} -> {state}")
            self._rebuild_current_menu()

    def _ws_config(self, data: WsData) -> None:
        """Merge one per-device config record, e.g. ``{"device": "LEVER_RH", "armed": true}``."""
        s = self.session
        if s:
            P.merge_firmware_row(s.hw, data)
            P.merge_controller_row(s.paradigm_settings, data)

    def _ws_error(self, data: WsData) -> None:
        """Log a device error."""
        self._log(f"  [error] [{data.get('device', '?')}] {data.get('desc', data)}", error=True)

    def _ws_upload_progress(self, data: WsData) -> None:
        """Show firmware upload progress."""
        self._log(f"  [upload] {data.get('stage', '')} ({data.get('percent', '?')}%)")
        self._set_status(f"Upload: {data.get('stage', '')} ({data.get('percent', '?')}%)")

    def _ws_disconnect(self, data: WsData) -> None:
        """Mark the session disconnected after a serial drop."""
        if self.session:
            self.session.state = "disconnected"
        reason = data.get("reason", "unknown")
        suffix = " (reconnecting...)" if data.get("reconnecting") else ""
        self._log(f"  [error] Serial disconnected: {reason}{suffix}", error=True)
        self._set_status(f"Serial disconnected on {self.target_name}: {reason}{suffix}", error=True)

    def _ws_reconnected(self, data: WsData) -> None:
        """Report a serial reconnect."""
        attempt = data.get("attempt", "?")
        self._log(f"  [info] Serial reconnected (attempt {attempt})")
        self._set_status(f"Serial reconnected on {self.target_name} (attempt {attempt})")

    def _ws_warning(self, data: WsData) -> None:
        """Report a kernel warning."""
        text = data.get("message")
        if not text and data.get("reason"):
            where = data.get("thread") or data.get("log_type")
            text = f"{data['reason']} ({where})" if where else data["reason"]
        text = f"Kernel warning: {text}" if text else "Kernel warning"
        self._log(f"  [warn] {text}", error=True)
        self._set_status(text, error=True)

    def _ws_failure(self, msg_type: str, data: WsData) -> None:
        """Report an export failure or kernel error."""
        label = "Auto-export failed" if msg_type == "export_failed" else "Kernel error"
        self._log(f"  [error] {label}: {data.get('reason', data)}", error=True)
        self._set_status(f"{label}: {data.get('reason', '')}", error=True)

    def _ws_split(self, data: WsData) -> None:
        """Log a segment split."""
        seg = data.get("segment_number", 0)
        self._log(f"  [split] Segment split — now on segment {_to_int(seg) + 1}")

    def _ws_restart(self, data: WsData) -> None:
        """Reset timers and counters after a program restart."""
        s = self.session
        if s:
            s.state = "running"
            s.program_start = time.time()
            s.program_end = None
            s.paused_time = 0
            s.pause_start = None
            s.attached = False
            self._reset_counters()
        self._log("  [restart] Program restarted")

    def _ws_suspended(self, msg_type: str, data: WsData) -> None:
        """Warn that the host will shut down and export what exists."""
        mins = round(_to_int(data.get("hard_kill_in", 0)) / 60)
        what = (
            "Server suspended (idle watchdog)"
            if msg_type == "server_suspended"
            else "Session orphaned — the host saw no connected client during the run"
        )
        self._log(f"  [warn] {what}. Host shuts down in ~{mins} min unless a client reconnects.", error=True)
        s = self.session
        if s and s.behavior_count_hint():
            self._auto_export()

    def _ws_resumed(self, data: WsData) -> None:
        """Log that the server resumed."""
        self._log("  [info] Server resumed")

    def _ws_log(self, data: WsData) -> None:
        """Echo a backend log line."""
        level = data.get("level", "info")
        text = data.get("message", str(data))
        self._log(f"  [{level}] {text}", error=level in ("error", "critical"))
