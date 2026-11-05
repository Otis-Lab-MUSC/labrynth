"""Command builders: what applySessionPreset and SessionStartModal send to the board."""

from __future__ import annotations

from collections.abc import Mapping

from .preset_paradigm import (
    LEVER_KEYS,
    active_lever_of,
    as_int,
    base_paradigm,
    can_dispatch_param,
    filter_targets,
    is_operant,
    is_paradigm,
    is_shared_lever_param,
    reward_pump2,
)
from .preset_tables import (
    LASER_MODE_BY_CONTINGENCY,
    LASER_MODE_COMMANDS,
    LASER_MODES_WITHOUT_PREAMBLE,
    LEVER_COMMANDS,
    LEVER_FILTER_VALUES,
    PAV_LASER_PHASE_COMMANDS,
    PRESET_COMMAND_MAP,
    SET_ACTIVE_PUMP,
    Command,
)
from .preset_types import DeviceState, Hardware, ParadigmSettings, Preset
from .reacher_tables import CMD

DEFAULT_INTERVAL_MS = 30000
DEFAULT_RATIO = 1
DEFAULT_PR_STEP = 1
VI_TIMEOUT_MS = 0


def lever_scheduler_commands(paradigm: str | None, active: str, hw: Hardware) -> list[Command]:
    """Active-lever pair, then the one scheduler-wide timeout / timeout mode."""
    if not is_operant(paradigm):
        return []
    other = "lh" if active == "rh" else "rh"
    codes = LEVER_COMMANDS[active]
    src = hw.get(codes["key"], {})
    out: list[Command] = [(codes["active"], None)]
    if not filter_targets(hw, other):
        out.append((LEVER_COMMANDS[other]["inactive"], None))
    # VI has no timeout, but the firmware boots with a 20 s post-reward lockout. Pin it to 0
    # on every dispatch, armed or not, and never send a mode (mirrors the web).
    if is_paradigm(paradigm, "vi"):
        out.append((codes["timeout"], VI_TIMEOUT_MS))
        return out
    if not any(hw.get(k, {}).get("armed") for k in LEVER_KEYS):
        return out
    timeout = as_int(src.get("timeout"))
    if timeout is not None:
        out.append((codes["timeout"], timeout))
    timeout_mode = as_int(src.get("timeoutMode"))
    if timeout_mode is not None and can_dispatch_param("timeoutMode", paradigm):
        out.append((codes["timeoutMode"], timeout_mode))
    return out


def laser_pavlovian_commands(laser: DeviceState) -> list[Command]:
    """Laser mode and phase commands for a pavlovian session."""
    out: list[Command] = []
    mode = laser.get("mode")
    if isinstance(mode, str) and mode:
        if mode not in LASER_MODES_WITHOUT_PREAMBLE:
            out.append((CMD["LASER_MODE_CONTINGENT"], None))
        out.append((LASER_MODE_COMMANDS[mode], None))
    phase = laser.get("phase")
    if mode != "independent" and isinstance(phase, str):
        out.append((PAV_LASER_PHASE_COMMANDS[phase], None))
    return out


def laser_commands(paradigm: str | None, laser: DeviceState | None) -> list[Command]:
    """Laser mode (and, for pavlovian, phase) commands for the paradigm."""
    laser = laser or {}
    if base_paradigm(paradigm) == "pavlovian":
        return laser_pavlovian_commands(laser)
    contingency = laser.get("contingency")
    if isinstance(contingency, str) and contingency:
        return [(LASER_MODE_COMMANDS[LASER_MODE_BY_CONTINGENCY[contingency]], None)]
    return []


def paradigm_commands(paradigm: str | None, ps: ParadigmSettings, *, at_start: bool) -> list[Command]:
    """Ratio, step or interval commands for the paradigm."""
    if is_paradigm(paradigm, "fr", "pr"):
        out: list[Command] = [(CMD["SET_RATIO"], int(ps.get("ratio", DEFAULT_RATIO)))]
        if at_start and is_paradigm(paradigm, "pr"):
            out.append((CMD["SET_PR_STEP"], int(ps.get("step", DEFAULT_PR_STEP))))
        return out
    if is_paradigm(paradigm, "vi"):
        return [(CMD["SET_VI_INTERVAL"], int(ps.get("interval", DEFAULT_INTERVAL_MS)))]
    if is_paradigm(paradigm, "omission"):
        return [(CMD["SET_OMISSION_INTERVAL"], int(ps.get("interval", DEFAULT_INTERVAL_MS)))]
    return []


def numeric_param_commands(key: str, state: DeviceState, paradigm: str | None) -> list[Command]:
    """Commands for a device's plain numeric parameters that the paradigm declares."""
    out: list[Command] = []
    for param_key, code in PRESET_COMMAND_MAP[key].get("params", {}).items():
        if not can_dispatch_param(param_key, paradigm) or is_shared_lever_param(key, param_key):
            continue
        v = state.get(param_key)
        if isinstance(v, (int, float)):
            out.append((code, int(v)))
    return out


def preset_commands(preset: Preset, paradigm: str | None, merged_hw: Hardware) -> list[Command]:
    """Commands applySessionPreset sends in the connected/stopped states."""
    is_pav = base_paradigm(paradigm) == "pavlovian"
    out: list[Command] = []
    for key, state in preset["hardware"].items():
        mapping = PRESET_COMMAND_MAP.get(key)
        if not mapping:
            continue
        if key in LEVER_KEYS and is_pav:
            continue
        armed = state.get("armed")
        if armed is not None:
            out.append((mapping["arm"] if armed else mapping["disarm"], None))
        out += numeric_param_commands(key, state, paradigm)
    for key, mapping in PRESET_COMMAND_MAP.items():
        if key not in preset["hardware"]:
            out.append((mapping["disarm"], None))
    if not is_pav:
        out.append((SET_ACTIVE_PUMP, int(reward_pump2(preset["hardware"]))))
    out += laser_commands(paradigm, preset["hardware"].get("laser"))
    if any(k in preset["hardware"] for k in LEVER_KEYS):
        out += lever_scheduler_commands(paradigm, active_lever_of(preset.get("paradigmSettings")), merged_hw)
    if preset.get("pavlovianParams"):
        out += [(int(c), int(v)) for c, v in preset["pavlovianParams"].items()]
    else:
        out += paradigm_commands(paradigm, preset.get("paradigmSettings", {}), at_start=False)
    return out


def contingency_commands(state: DeviceState, params: Mapping[str, int], press_contingent: bool) -> list[Command]:
    """Lever-filter and onset-delay commands from a device's contingency."""
    out: list[Command] = []
    cont = state.get("contingency")
    if not isinstance(cont, dict):
        return out
    lever_filter = cont.get("leverFilter")
    if press_contingent and lever_filter is not None and "leverFilter" in params:
        out.append((params["leverFilter"], LEVER_FILTER_VALUES.get(str(lever_filter), 0)))
    delay = cont.get("delay")
    if isinstance(delay, int) and delay > 0 and "delay" in params:
        out.append((params["delay"], delay))
    return out


def armed_device_commands(hw: Hardware, paradigm: str | None, press_contingent: bool) -> list[Command]:
    """Arm each armed device, then re-send its parameters and contingency."""
    is_pav = base_paradigm(paradigm) == "pavlovian"
    out: list[Command] = []
    for key, state in hw.items():
        mapping = PRESET_COMMAND_MAP.get(key)
        if not mapping or not state.get("armed"):
            continue
        if key in LEVER_KEYS and is_pav:
            continue
        out.append((mapping["arm"], None))
        params = mapping.get("params")
        if not params:
            continue
        out += numeric_param_commands(key, state, paradigm)
        out += contingency_commands(state, params, press_contingent)
    return out


def start_commands(
    paradigm: str | None, hw: Hardware, paradigm_settings: ParadigmSettings, pavlovian_params: Mapping[int, int] | None
) -> list[Command]:
    """Commands SessionStartModal.handleStart sends before start/arm.

    Re-sends the whole configuration so a stale or replayed firmware state
    (reconnect, earlier session on the same board) cannot leak into the run.
    """
    is_pav = base_paradigm(paradigm) == "pavlovian"
    press_contingent = not is_pav and base_paradigm(paradigm) != "omission"
    out: list[Command] = []
    if is_pav and pavlovian_params:
        out += [(int(c), int(v)) for c, v in pavlovian_params.items()]
    if not is_pav:
        out += paradigm_commands(paradigm, paradigm_settings, at_start=True)
    out += armed_device_commands(hw, paradigm, press_contingent)
    out += laser_commands(paradigm, hw.get("laser"))
    if is_operant(paradigm):
        out += lever_scheduler_commands(paradigm, active_lever_of(paradigm_settings), hw)
        out.append((SET_ACTIVE_PUMP, int(reward_pump2(hw))))
    return out
