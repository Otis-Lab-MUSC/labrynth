"""WebSocket message routing for the REACHER CLI."""

from __future__ import annotations

import time

from . import presets as P
from .constants import PUMP_DEVICES
from .host import CliHost


class WsMessageMixin(CliHost):
    """Routes WebSocket messages into session state, mixed into ``ReacherCLI``."""

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
