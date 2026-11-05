"""Hardware and program actions for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .constants import (
    DEVICE_CONFIGS,
    SYSTEM_COMMANDS,
)
from .host import CliHost


class HardwareActionsMixin(CliHost):
    """Hardware commands, mixed into ``ReacherCLI``."""

    async def _send_hw_command(self, code: int, value: int | None = None) -> None:
        """Send a firmware command and record it locally so the start-time re-send carries it."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.send_command(self.session.id, code, value)
            # Record locally so the start-time re-send carries this setting.
            P.record_command(self.session.hw, self.session.paradigm_settings, code, value)
            for cfg in DEVICE_CONFIGS:
                if code == cfg["arm"]:
                    self._set_status(f"{cfg['label']} armed")
                    break
                elif code == cfg["disarm"]:
                    self._set_status(f"{cfg['label']} disarmed")
                    break
            else:
                if value is not None:
                    self._set_status(f"Command {code} sent with value {value}")
                else:
                    self._set_status(f"Command {code} sent")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Command failed: {exc}", error=True)

    async def _send_laser_mode(self, code: int) -> None:
        """Send a laser mode command, preceded by contingent mode for trial-paired modes."""
        # Pavlovian trial-paired modes need contingent (681) first, as in
        # ConfigurationPanel.tsx.
        if code in (691, 692, 693):
            await self._send_hw_command(681)
        await self._send_hw_command(code)

    async def _send_commands(self, cmds: list[tuple[int, int | None]]) -> list[int]:
        """Send a batch, skipping codes the firmware does not declare. Returns skipped codes."""
        kept, dropped = P.filter_allowed(cmds, self.session.allowed_codes)
        for code, value in kept:
            await self.api.send_command(self.session.id, code, value)
        return dropped

    async def _test_chain(self) -> None:
        """Run the firmware's test chain."""
        await self._send_hw_command(SYSTEM_COMMANDS["test_chain"])

    async def _toggle_test_mode(self) -> None:
        """Flip test mode locally and tell the firmware."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.test_mode = not self.session.test_mode
        await self._send_hw_command(SYSTEM_COMMANDS["test_mode"])
        self._rebuild_current_menu()
