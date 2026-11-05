"""Session attach and detach actions for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .errors import API_ERRORS
from .host import CliHost
from .state import SessionState


def _dict_rows(value: object) -> list[dict[str, object]]:
    """Return the dict entries of a JSON list, or an empty list for anything else."""
    if not isinstance(value, list):
        return []
    return [row for row in value if isinstance(row, dict)]


def _opt_dict(value: object) -> dict[str, object] | None:
    """Return the value when it is a JSON object, else None."""
    return value if isinstance(value, dict) else None


def _opt_str(value: object) -> str | None:
    """Return the value when it is a string, else None."""
    return value if isinstance(value, str) else None


def _opt_int(value: object) -> int | None:
    """Return the value when it is an integer, else None."""
    return value if isinstance(value, int) and not isinstance(value, bool) else None


class AttachActionsMixin(CliHost):
    """Attach, detach and hydrate, mixed into ``ReacherCLI``."""

    async def _detach(self) -> None:
        """Forget the session locally; it keeps running on the host."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        sid = self.session.id
        self._stop_ws()
        self.session = None
        # The host's orphan cleanup destroys a session with no connected client
        # (about 60 s idle, 10 min running), so re-attach before then.
        self._set_status(f"Detached from {sid[:8]} — re-attach soon: the host ends client-less sessions")
        self._rebuild_current_menu()

    async def _choose_attach(self) -> None:
        """List the target's sessions and ask which to attach to."""
        try:
            sessions = _dict_rows((await self.api.list_sessions()).get("sessions"))
        except API_ERRORS as exc:
            self._set_status(f"List sessions failed: {exc}", error=True)
            return
        if not sessions:
            self._set_status(f"No sessions on {self.target_name}")
            return
        opts = [
            (
                f"{str(x['session_id'])[:8]}  {x.get('paradigm') or '-':<10} {x.get('port', '')}  [{x.get('state')}]",
                str(x["session_id"]),
            )
            for x in sessions
        ]
        self._prompt_select(f"Attach to a session on {self.target_name}", opts, self._attach)

    async def _attach(self, sid: str) -> None:
        """Rebuild local state for a session this process did not create."""
        try:
            info = await self.api.get_session(sid)
        except API_ERRORS as exc:
            self._set_status(f"Attach failed: {exc}", error=True)
            return
        self._stop_ws()
        self.monitor_lines.clear()
        s = SessionState(
            id=sid,
            port=_opt_str(info.get("port")) or "",
            paradigm=_opt_str(info.get("paradigm")),
            board=_opt_str(info.get("board")),
            state=_opt_str(info.get("state")) or "idle",
        )
        s.firmware_info = _opt_dict(info.get("firmware_info"))
        s.attached = True
        # The server reports a list even in Auto mode, so only an explicit choice is kept;
        # otherwise the next limit edit would pin Auto to whichever pump is active now.
        if info.get("follows_reward_pump") is False:
            s.limit_settings["counted_pumps"] = info.get("counted_pumps")
        s.server_infusion_count = _opt_int(info.get("infusion_count"))
        s.infusions_by_pump = _opt_dict(info.get("infusions_by_pump"))
        if s.paradigm:
            s.name = f"{s.paradigm.upper()} {s.port}"
        self.session = s
        await self._load_commands()
        await self._hydrate_config()
        # Replay what the host already recorded so counters are correct, then
        # follow live from that point (the WS reconnect path uses ``since``).
        try:
            resp = await self.api.get_behavior(sid)
            for entry in _dict_rows(resp.get("data")):
                self._handle_ws_message({"type": "event", "data": entry}, replay=True)
            total = _opt_int(resp.get("total"))
            if total is not None:
                s.backend_event_count = total
        except API_ERRORS as exc:
            self._set_status(f"Attached, but event history failed: {exc}", error=True)
        self._ensure_ws()
        self._set_status(
            f"Attached to {sid[:8]} on {self.target_name} [{s.state}] — {s.backend_event_count} events so far"
        )
        self._rebuild_current_menu()

    async def _hydrate_config(self) -> None:
        """Seed device state from the host's last firmware config dump."""
        s = self.session
        if not s:
            return
        try:
            cfg = await self.api.get_config(s.id)
        except API_ERRORS:
            return
        for row in _dict_rows(cfg.get("hardware_settings")):
            P.merge_firmware_row(s.hw, row)
            P.merge_controller_row(s.paradigm_settings, row)
        firmware_info = _opt_dict(cfg.get("firmware_info"))
        if firmware_info:
            s.firmware_info = firmware_info

    async def _show_session_info(self) -> None:
        """Show the session's id, port, state, paradigm and board in the status bar."""
        s = self.session
        if not s:
            self._set_status("No active session")
            return
        info = (
            f"ID: {s.id}  |  Port: {s.port}  |  State: {s.state}  |  "
            f"Paradigm: {s.paradigm or 'none'}  |  Board: {s.board or 'none'}"
        )
        self._set_status(info)
