"""Session lifecycle actions for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .host import CliHost
from .state import SessionState


class SessionActionsMixin(CliHost):
    """Create, connect, attach, upload and destroy sessions, mixed into ``ReacherCLI``."""

    async def _create_session(self) -> None:
        """Ask for a serial port, then create a session on it."""
        try:
            ports_resp = await self.api.list_ports()
            ports = ports_resp.get("ports", [])
        except Exception:
            ports = []

        if not ports:
            self._set_status("No serial ports found", error=True)
            return

        self._prompt_select(
            "Select Serial Port",
            [(p, p) for p in ports],
            self._on_port_selected,
        )

    async def _on_port_selected(self, port: str) -> None:
        """Ask for an optional paradigm after a port is chosen."""
        # Optionally select paradigm
        try:
            paradigms_resp = await self.api.list_paradigms()
            paradigms = paradigms_resp.get("paradigms", [])
        except Exception:
            paradigms = []

        if paradigms:
            self._prompt_select(
                "Select Paradigm (optional — Esc to skip)",
                [(p, p) for p in paradigms],
                lambda p: self._finish_create_session(port, p),
            )
        else:
            await self._finish_create_session(port, None)

    async def _finish_create_session(self, port: str, paradigm: str | None) -> None:
        """Create the session on the backend and make it the active one."""
        try:
            resp = await self.api.create_session(port, paradigm)
            sid = resp.get("session_id") or resp.get("id", "")
            self._stop_ws()
            self.monitor_lines.clear()
            self.session = SessionState(id=sid, port=port, paradigm=paradigm)
            self._ensure_ws()
            self._set_status(f"Session created on {self.target_name}: {sid[:8]}...")
            await self._load_commands()
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Create session failed: {exc}", error=True)

    async def _connect(self) -> None:
        """Open the session's serial connection."""
        if not self.session:
            self._set_status("No session — create one first", error=True)
            return
        try:
            await self.api.connect_serial(self.session.id)
            self.session.state = "connected"
            self._set_status("Serial connected")
            await self._hydrate_config()
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Connect failed: {exc}", error=True)

    async def _disconnect(self) -> None:
        """Close the session's serial connection."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.disconnect_serial(self.session.id)
            self.session.state = "disconnected"
            self._set_status("Serial disconnected")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Disconnect failed: {exc}", error=True)

    async def _load_commands(self) -> None:
        """Fetch the registry-driven command set the running firmware accepts.

        Feeds both the Pavlovian settings menu and the optional-hardware
        capability flags.
        """
        if not self.session:
            return
        try:
            resp = await self.api.get_commands(self.session.id)
            commands = resp.get("commands", [])
            self.session.pav_commands = commands
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Failed to load commands: {exc}", error=True)

    async def _reset_session(self) -> None:
        """Reset the session on the backend and clear local counters and state."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.reset_session(self.session.id)
            s = self.session
            s.state = "idle"
            s.hw = P.default_hardware()
            self._reset_counters()
            s.program_start = None
            s.program_end = None
            s.last_export = s.last_download = None
            self._set_status("Session reset")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Reset failed: {exc}", error=True)

    def _reset_counters(self) -> None:
        """Zero the local event counters."""
        s = self.session
        if not s:
            return
        s.infusion_count = s.press_count = s.trial_count = 0
        s.server_infusion_count = s.infusions_by_pump = None
        s.cs_plus_count = s.cs_minus_count = s.frame_count = 0
        s.backend_event_count = 0
        s.rh_counts = {"active": 0, "timeout": 0, "inactive": 0}
        s.lh_counts = {"active": 0, "timeout": 0, "inactive": 0}

    async def _destroy_session(self) -> None:
        """Ask for confirmation before destroying the session."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Destroy session? This cannot be undone.",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_destroy,
        )

    async def _confirm_destroy(self, choice: str) -> None:
        """Destroy the session if the operator confirmed."""
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            await self.api.destroy_session(self.session.id)
            self._stop_ws()
            self.session = None
            self._set_status("Session destroyed")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Destroy failed: {exc}", error=True)
