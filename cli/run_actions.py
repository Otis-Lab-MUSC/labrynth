"""Hardware and program actions for the REACHER CLI."""

from __future__ import annotations

import time

from . import presets as P
from .errors import API_ERRORS
from .host import CliHost


class RunActionsMixin(CliHost):
    """Start, stop, pause, split and restart, mixed into ``ReacherCLI``."""

    async def _prepare_run(self) -> bool:
        """SessionStartModal.handleStart: limits, then the full config re-send.

        Re-sending everything (rather than trusting what the board holds) is
        what keeps a reconnect, a replayed pump target, or an earlier session
        on the same board from leaking into this run. Includes 221 (reward
        pump target) for operant paradigms.
        """
        s = self.session
        if s is None:
            self._set_status("No session", error=True)
            return False
        missing = P.missing_limit_fields(self._web_limits())
        if missing:
            self._set_status(f"Set the limits first: {', '.join(missing)}", error=True)
            return False
        try:
            await self._send_limits()
            await self._send_commands(P.start_commands(s.paradigm, s.hw, s.paradigm_settings, s.pavlovian_params))
            return True
        except API_ERRORS as exc:
            self._set_status(f"Start aborted — config not applied: {exc}", error=True)
            return False

    async def _start_program(self) -> None:
        """Apply the pre-run configuration and start the program."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            if not await self._prepare_run():
                return
            await self.api.start_program(self.session.id)
            self.session.state = "running"
            self.session.program_start = time.time()
            self.session.program_end = None
            self.session.last_export = self.session.last_download = None
            self._set_status("Session started")
            self._rebuild_current_menu()
        except API_ERRORS as exc:
            self._set_status(f"Start failed: {exc}", error=True)

    async def _stop_program(self) -> None:
        """Ask for confirmation before stopping the program."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Stop session?",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_stop,
        )

    async def _confirm_stop(self, choice: str) -> None:
        """Stop the program if the operator confirmed."""
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            result = await self.api.stop_program(self.session.id)
            if result.get("status") == "not_running":
                self._set_status("Nothing was running")
                return
            self.session.state = "stopped"
            self.session.program_end = time.time()
            self._set_status("Session stopped")
            self._rebuild_current_menu()
        except API_ERRORS as exc:
            self._set_status(f"Stop failed: {exc}", error=True)

    async def _pause_program(self) -> None:
        """Pause a running program or resume a paused one."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            was_paused = self.session.state == "paused"
            result = await self.api.pause_program(self.session.id)
            # The session_state WS update can land before this response, so
            # branch on what the backend did rather than on local state.
            status = result.get("status") if isinstance(result, dict) else None
            if status == "resumed" or (status != "paused" and was_paused):
                # Resume
                if self.session.pause_start:
                    self.session.paused_time += time.time() - self.session.pause_start
                    self.session.pause_start = None
                self.session.state = "running"
                self._set_status("Session resumed")
            else:
                self.session.state = "paused"
                self.session.pause_start = time.time()
                self._set_status("Session paused")
            self._rebuild_current_menu()
        except API_ERRORS as exc:
            self._set_status(f"Pause/resume failed: {exc}", error=True)

    async def _split_segment(self) -> None:
        """End the current data segment and begin a new one."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            result = await self.api.split_segment(self.session.id)
            seg = result.get("segment_number")
            current = seg if isinstance(seg, int) and not isinstance(seg, bool) else None
            next_segment = current + 1 if current is not None else "?"
            self._set_status(f"Segment split — now on segment {next_segment}")
        except API_ERRORS as exc:
            self._set_status(f"Split failed: {exc}", error=True)

    async def _restart_program(self) -> None:
        """Ask for confirmation before restarting the program."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Restart program? (Arduino will stop and re-start)",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_restart,
        )

    async def _confirm_restart(self, choice: str) -> None:
        """Restart the program if the operator confirmed."""
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            await self.api.restart_program(self.session.id)
            self.session.state = "running"
            self.session.program_start = time.time()
            self.session.program_end = None
            self.session.paused_time = 0
            self.session.pause_start = None
            self._set_status("Program restarted")
            self._rebuild_current_menu()
        except API_ERRORS as exc:
            self._set_status(f"Restart failed: {exc}", error=True)
