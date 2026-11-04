"""Session lifecycle actions for the REACHER CLI."""

from __future__ import annotations

from typing import TYPE_CHECKING

from . import presets as P
from .host import CliHost
from .state import SessionState

if TYPE_CHECKING:
    pass


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

    async def _upload_firmware(self) -> None:
        """Ask for a board, then flash firmware; refused while the session is running."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        # The host refuses a reflash mid-run (409); say why before the board/paradigm prompts.
        if self.session.state in ("running", "paused", "uploading"):
            self._set_status(
                f"Can't upload firmware while the session is {self.session.state} — stop it first",
                error=True,
            )
            return
        self._prompt_select(
            "Select Board",
            [("Arduino Uno", "uno"), ("Arduino Mega", "mega")],
            self._on_board_selected,
        )

    async def _on_board_selected(self, board: str) -> None:
        """Ask for the paradigm to flash on the chosen board."""
        try:
            paradigms_resp = await self.api.list_paradigms(board)
            paradigms = paradigms_resp.get("paradigms", [])
        except Exception:
            paradigms = ["fr", "pr", "vi", "omission", "pavlovian"]

        self._prompt_select(
            "Select Paradigm",
            [(p, p) for p in paradigms],
            lambda p: self._finish_upload(board, p),
        )

    def _read_local_hex(self, paradigm: str, board: str) -> str | None:
        """Read a local hex file and return base64-encoded content, or None."""
        import base64

        try:
            from reacher.uploader import FirmwareUploader

            uploader = FirmwareUploader()
            path = uploader.get_hex_path(paradigm, board)
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode("ascii")
        except Exception:
            return None

    async def _finish_upload(self, board: str, paradigm: str) -> None:
        """Flash the chosen paradigm and reset local device state to the new firmware's defaults."""
        if not self.session:
            return
        try:
            self._set_status("Uploading firmware...")
            self.session.state = "uploading"
            hex_data = self._read_local_hex(paradigm, board)
            await self.api.upload_firmware(self.session.id, paradigm, board, hex_data=hex_data)
            self.session.paradigm = paradigm
            self.session.board = board
            self.session.state = "connected"
            # A reflashed board starts from its own defaults; forget what the
            # previous firmware had and re-read it from the config dump.
            self.session.hw = P.default_hardware()
            self.session.pavlovian_params = {}
            self._set_status(f"Firmware uploaded: {paradigm} ({board})")
            if not self.session.name:
                self.session.name = f"{paradigm.upper()} {self.session.port}"
            # Unconditional: the upload just changed which commands the board
            # accepts, so the capability flags must be re-sniffed.
            await self._load_commands()
            await self._hydrate_config()
            self._rebuild_current_menu()
        except Exception as exc:
            self.session.state = "idle"
            self._set_status(f"Upload failed: {exc}", error=True)

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
            sessions = (await self.api.list_sessions()).get("sessions", [])
        except Exception as exc:
            self._set_status(f"List sessions failed: {exc}", error=True)
            return
        if not sessions:
            self._set_status(f"No sessions on {self.target_name}")
            return
        opts = [
            (
                f"{x['session_id'][:8]}  {x.get('paradigm') or '-':<10} {x.get('port', '')}  [{x.get('state')}]",
                x["session_id"],
            )
            for x in sessions
        ]
        self._prompt_select(f"Attach to a session on {self.target_name}", opts, self._attach)

    async def _attach(self, sid: str) -> None:
        """Rebuild local state for a session this process did not create."""
        try:
            info = await self.api.get_session(sid)
        except Exception as exc:
            self._set_status(f"Attach failed: {exc}", error=True)
            return
        self._stop_ws()
        self.monitor_lines.clear()
        s = SessionState(
            id=sid,
            port=info.get("port", ""),
            paradigm=info.get("paradigm"),
            board=info.get("board"),
            state=info.get("state", "idle"),
        )
        s.firmware_info = info.get("firmware_info")
        s.attached = True
        # The server reports a list even in Auto mode, so only an explicit choice is kept;
        # otherwise the next limit edit would pin Auto to whichever pump is active now.
        if info.get("follows_reward_pump") is False:
            s.limit_settings["counted_pumps"] = info.get("counted_pumps")
        s.server_infusion_count = info.get("infusion_count")
        s.infusions_by_pump = info.get("infusions_by_pump")
        if s.paradigm:
            s.name = f"{s.paradigm.upper()} {s.port}"
        self.session = s
        await self._load_commands()
        await self._hydrate_config()
        # Replay what the host already recorded so counters are correct, then
        # follow live from that point (the WS reconnect path uses ``since``).
        try:
            resp = await self.api.get_behavior(sid)
            for entry in resp.get("data", []):
                self._handle_ws_message({"type": "event", "data": entry}, replay=True)
            s.backend_event_count = resp.get("total", s.backend_event_count)
        except Exception as exc:
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
        except Exception:
            return
        for row in cfg.get("hardware_settings", []) or []:
            P.merge_firmware_row(s.hw, row)
            P.merge_controller_row(s.paradigm_settings, row)
        if cfg.get("firmware_info"):
            s.firmware_info = cfg["firmware_info"]

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
