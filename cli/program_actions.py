"""Hardware and program actions for the REACHER CLI."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import TYPE_CHECKING

from . import presets as P
from .constants import (
    COUNTED_PUMP_CHOICES,
    DEVICE_CONFIGS,
    ITI_CODES,
    ITI_DEFAULTS,
    PARADIGM_SETTING_CODES,
    SYSTEM_COMMANDS,
)
from .preset_types import LimitDefaults
from .state import SessionState

if TYPE_CHECKING:
    from .client import ReacherClient


def _limits_from_preset(limit_defaults: LimitDefaults) -> dict[str, object]:
    """Web ``limitDefaults`` (camelCase) -> the CLI's backend-shaped limits."""
    return {
        "type": limit_defaults.get("limitType", "Time"),
        "time_limit": int(limit_defaults.get("timeLimit", P.LIMIT_DEFAULTS["timeLimit"])),
        "infusion_limit": int(limit_defaults.get("infusionLimit", P.LIMIT_DEFAULTS["infusionLimit"])),
        "delay": int(limit_defaults.get("delay", P.LIMIT_DEFAULTS["delay"])),
        "counted_pumps": _counted_pumps_from_preset(limit_defaults.get("countedPumps")),
    }


def _counted_pumps_from_preset(value: object) -> list[str] | None:
    """Absent, empty, or only unknown pumps -> None (Auto), matching the web resolver."""
    if not isinstance(value, list):
        return None
    pumps = list(dict.fromkeys(p for p in value if p in ("PUMP_1", "PUMP_2")))
    return pumps or None


class ProgramActionsMixin:
    """Hardware commands, presets, run control and limits, mixed into ``ReacherCLI``."""

    if TYPE_CHECKING:
        api: ReacherClient
        session: SessionState | None

        def _prompt_select(
            self, title: str, options: list[tuple[str, str]], callback: Callable[..., object]
        ) -> None: ...
        def _rebuild_current_menu(self) -> None: ...
        def _set_status(self, msg: str, error: bool = False) -> None: ...

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

    # ───────────────────────────────────────────────────────────────────
    # Program actions
    # ───────────────────────────────────────────────────────────────────

    async def _apply_preset(self, preset_id: str) -> None:
        """ConfigurationPanel.applySessionPreset, using the shared definitions."""
        s = self.session
        if not s:
            self._set_status("No session", error=True)
            return
        preset = P.PRESET_BY_ID[preset_id]
        # Same rule as the web panel: a preset is pre-start configuration, so it is
        # refused mid-run instead of rewriting the displayed settings and limits.
        if s.state in ("running", "paused", "uploading"):
            self._set_status(f"Can't apply a preset while the session is {s.state} — stop it first", error=True)
            return
        self._set_status(f"Applying preset: {preset['name']}...")
        try:
            merged = P.merge_preset_hardware(s.hw, preset)
            s.hw = merged
            dropped: list[int] = []
            # Commands only go out pre-start (connected/stopped). In idle/disconnected
            # the state is staged and sent by the start-time re-send, like the web.
            if s.state in ("connected", "stopped"):
                dropped = await self._send_commands(P.preset_commands(preset, s.paradigm, merged))
            s.paradigm_settings.update(preset.get("paradigmSettings", {}))
            if preset.get("pavlovianParams"):
                s.pavlovian_params = {int(k): int(v) for k, v in preset["pavlovianParams"].items()}
            s.limit_settings = _limits_from_preset(preset["limitDefaults"])
            note = f" ({len(dropped)} commands not on this firmware skipped)" if dropped else ""
            staged = "" if s.state in ("connected", "stopped") else " — staged, sent at start"
            self._set_status(f"Preset '{preset['name']}' applied{staged}{note}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Preset failed: {exc}", error=True)

    async def _send_paradigm_setting(self, key: str, value: int) -> None:
        """Send one paradigm setting (ratio, step or interval) to the firmware."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        code = PARADIGM_SETTING_CODES.get(key)
        if code is None:
            self._set_status(f"Unknown setting: {key}", error=True)
            return
        await self._send_hw_command(code, value)
        # VI and OM share the single "interval" storage slot (mirrors the GUI,
        # which keeps one `interval` field but sends 204 for VI / 203 for OM).
        store_key = "interval" if key in ("vi_interval", "om_interval") else key
        self.session.paradigm_settings[store_key] = value

    async def _set_pavlovian_param(self, code: int, value: int) -> None:
        """Send a (non-ITI) Pavlovian parameter and record it for display."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        await self._send_hw_command(code, value)
        self.session.pavlovian_params[code] = value
        self._rebuild_current_menu()

    async def _send_pavlovian_iti(self, code: int, value: int) -> None:
        """Send an ITI parameter (216/217/218) only if Min <= Mean <= Max.

        Mirrors `itiValid` in PavlovianSettings.tsx: the candidate value is
        checked against the other two tracked values (falling back to defaults).
        """
        if not self.session:
            self._set_status("No session", error=True)
            return
        pp = self.session.pavlovian_params
        cur = {c: pp.get(c, ITI_DEFAULTS[c]) for c in ITI_CODES}
        cur[code] = value
        mean, iti_min, iti_max = cur[216], cur[217], cur[218]
        if not (iti_min <= mean <= iti_max and iti_min >= 0 and iti_max > 0):
            self._set_status(
                f"Invalid ITI: need Min <= Mean <= Max (Min={iti_min}, Mean={mean}, Max={iti_max})",
                error=True,
            )
            return
        await self._send_hw_command(code, value)
        self.session.pavlovian_params[code] = value
        self._rebuild_current_menu()

    async def _prepare_run(self) -> bool:
        """SessionStartModal.handleStart: limits, then the full config re-send.

        Re-sending everything (rather than trusting what the board holds) is
        what keeps a reconnect, a replayed pump target, or an earlier session
        on the same board from leaking into this run. Includes 221 (reward
        pump target) for operant paradigms.
        """
        s = self.session
        missing = P.missing_limit_fields(self._web_limits())
        if missing:
            self._set_status(f"Set the limits first: {', '.join(missing)}", error=True)
            return False
        try:
            await self._send_limits()
            await self._send_commands(P.start_commands(s.paradigm, s.hw, s.paradigm_settings, s.pavlovian_params))
            return True
        except Exception as exc:
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
        except Exception as exc:
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
        except Exception as exc:
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
        except Exception as exc:
            self._set_status(f"Pause/resume failed: {exc}", error=True)

    async def _split_segment(self) -> None:
        """End the current data segment and begin a new one."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            result = await self.api.split_segment(self.session.id)
            seg = result.get("segment_number", "?")
            self._set_status(f"Segment split — now on segment {int(seg) + 1}")
        except Exception as exc:
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
        except Exception as exc:
            self._set_status(f"Restart failed: {exc}", error=True)

    def _web_limits(self) -> P.LimitSettings:
        """Build the web-shaped limit payload from the session limits."""
        lim = self.session.limit_settings
        return {
            "limitType": lim["type"],
            "timeLimit": lim["time_limit"],
            "infusionLimit": lim["infusion_limit"],
            "delay": lim["delay"],
            "countedPumps": lim.get("counted_pumps"),
        }

    async def _send_limits(self) -> bool:
        """Send the limits set so far. False when none are set yet (nothing is sent)."""
        body = P.limit_payload(self._web_limits())
        if body is None:
            return False
        limit_type = str(body.pop("type"))
        await self.api.set_limit(self.session.id, limit_type, **body)
        return True

    async def _set_limit_type(self, limit_type: str) -> None:
        """Set the limit type (time, infusion or both) and send the limits."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings["type"] = limit_type
        try:
            sent = await self._send_limits()
            self._set_status(
                f"Limit type set to {limit_type}" + ("" if sent else " (sent with the first limit you set)")
            )
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    async def _set_limit_value(self, key: str, value: int) -> None:
        """Set one numeric limit and send the limits."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings[key] = value
        try:
            sent = await self._send_limits()
            self._set_status(f"{key} set to {value}" + ("" if sent else " (saved; sent once a limit above 0 is set)"))
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    async def _set_counted_pumps(self, key: str) -> None:
        """Choose which pumps count toward the infusion limit and send the limits."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        label, pumps = COUNTED_PUMP_CHOICES[key]
        self.session.limit_settings["counted_pumps"] = list(pumps) if pumps else None
        try:
            await self._send_limits()
            self._set_status(f"Counted pumps set to {label}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)
