"""Hardware and program actions for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .constants import (
    COUNTED_PUMP_CHOICES,
    ITI_CODES,
    ITI_DEFAULTS,
    PARADIGM_SETTING_CODES,
)
from .errors import API_ERRORS
from .host import CliHost
from .preset_types import LimitDefaults


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


class ProgramActionsMixin(CliHost):
    """Hardware commands, presets, run control and limits, mixed into ``ReacherCLI``."""

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
        except API_ERRORS as exc:
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

    def _web_limits(self) -> P.LimitSettings:
        """Build the web-shaped limit payload from the session limits."""
        session = self.session
        if session is None:
            raise RuntimeError("limits requested without a session")
        lim = session.limit_settings
        return {
            "limitType": lim["type"],
            "timeLimit": lim["time_limit"],
            "infusionLimit": lim["infusion_limit"],
            "delay": lim["delay"],
            "countedPumps": lim.get("counted_pumps"),
        }

    async def _send_limits(self) -> bool:
        """Send the limits set so far. False when none are set yet (nothing is sent)."""
        session = self.session
        if session is None:
            return False
        body = P.limit_payload(self._web_limits())
        if body is None:
            return False
        limit_type = str(body.pop("type"))
        await self.api.set_limit(session.id, limit_type, **body)
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
        except API_ERRORS as exc:
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
        except API_ERRORS as exc:
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
        except API_ERRORS as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)
