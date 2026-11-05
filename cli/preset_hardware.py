"""Local hardware state: defaults, command recording and config-record merges."""

from __future__ import annotations

from .preset_paradigm import LEVER_KEYS, contingency_of
from .preset_tables import (
    LASER_MODE_BY_CODE_UPDATES,
    LEVER_FILTER_NAMES,
    PAV_LASER_MODE_BY_CODE,
    PRESET_COMMAND_MAP,
)
from .preset_types import DeviceState, Hardware, ParadigmSettings
from .reacher_tables import CMD

DEFAULT_SLM_PIN = 11
CONFIG_NUMERIC_FIELDS = ("frequency", "duration", "timeout")
RATIO_CODES = (CMD["SET_RATIO"], CMD["LEVER_RH_SET_RATIO"], CMD["LEVER_LH_SET_RATIO"])
INTERVAL_CODES = (CMD["SET_OMISSION_INTERVAL"], CMD["SET_VI_INTERVAL"])
PHASE_CODES = (CMD["PAV_LASER_PHASE_REWARD"], CMD["PAV_LASER_PHASE_CUE"])
ACTIVE_LEVER_CODES = (CMD["LEVER_RH_SET_ACTIVE"], CMD["LEVER_LH_SET_ACTIVE"])


def record_param_command(hw: Hardware, key: str, param: str, value: int) -> None:
    """Store one device parameter value in local state."""
    if param in ("timeout", "timeoutMode") and key in LEVER_KEYS:
        hw["rhLever"][param] = hw["lhLever"][param] = value
    elif param == "leverFilter":
        contingency_of(hw[key])["leverFilter"] = LEVER_FILTER_NAMES.get(value, "none")
    elif param == "delay" and key == "laser":
        hw[key]["onsetDelay"] = value
    elif param == "delay":
        contingency_of(hw[key])["delay"] = value
    else:
        hw[key][param] = value


def record_device_command(hw: Hardware, code: int, value: int | None) -> bool:
    """Record an arm, disarm or parameter command; return True when one matched."""
    for key, mapping in PRESET_COMMAND_MAP.items():
        if code == mapping["arm"]:
            hw[key]["armed"] = True
            return True
        if code == mapping["disarm"]:
            hw[key]["armed"] = False
            return True
        for param, pcode in mapping.get("params", {}).items():
            if code != pcode or value is None:
                continue
            record_param_command(hw, key, param, int(value))
            return True
    return False


def record_laser_command(laser: DeviceState, code: int) -> bool:
    """Record a laser mode or phase command; return True when one matched."""
    if code in LASER_MODE_BY_CODE_UPDATES:
        laser.update(LASER_MODE_BY_CODE_UPDATES[code])
    elif code in PAV_LASER_MODE_BY_CODE:
        laser["mode"] = PAV_LASER_MODE_BY_CODE[code]
    elif code in PHASE_CODES:
        laser["phase"] = "reward" if code == CMD["PAV_LASER_PHASE_REWARD"] else "cue"
    else:
        return False
    return True


def record_settings_command(paradigm_settings: ParadigmSettings, code: int, value: int | None) -> None:
    """Record a scheduler-wide setting command into the paradigm settings."""
    if code in ACTIVE_LEVER_CODES:
        paradigm_settings["activeLever"] = "rh" if code == CMD["LEVER_RH_SET_ACTIVE"] else "lh"
    elif value is None:
        return
    elif code in RATIO_CODES:
        paradigm_settings["ratio"] = int(value)
    elif code == CMD["SET_PR_STEP"]:
        paradigm_settings["step"] = int(value)
    elif code in INTERVAL_CODES:
        paradigm_settings["interval"] = int(value)


def record_command(hw: Hardware, paradigm_settings: ParadigmSettings, code: int, value: int | None) -> None:
    """Mirror one sent command into local state, so start-time dispatch re-sends it."""
    if record_device_command(hw, code, value):
        return
    if record_laser_command(hw["laser"], code):
        return
    record_settings_command(paradigm_settings, code, value)


def default_hardware() -> Hardware:
    """defaultHardwareUiState() in web/src/store/useSessionStore.ts, minus guesses.

    Unlike the web (which seeds 0 and lets its device cards overwrite it), the
    CLI never shows an editable value before sending it, so unknown values stay
    None and are skipped by the start-time dispatch.
    """

    def contingency() -> dict[str, str | int]:
        return {"leverFilter": "none", "delay": 0}

    return {
        # None, not the web's 0: the CLI seeds these from the firmware's config
        # dump, and an unknown timeout must never be written to the board as 0.
        "rhLever": {"armed": False, "timeout": None, "timeoutMode": None},
        "lhLever": {"armed": False, "timeout": None, "timeoutMode": None},
        # Frequencies/durations likewise start unknown (None = never sent) and
        # are filled from the board's config dump or the operator's input.
        "primaryCue": {"armed": False, "frequency": None, "duration": None, "contingency": contingency()},
        "secondaryCue": {"armed": False, "frequency": None, "duration": None, "contingency": contingency()},
        "primaryPump": {"armed": False, "duration": None, "contingency": contingency(), "flowRateUlPerSec": None},
        "secondaryPump": {"armed": False, "duration": None, "contingency": contingency(), "flowRateUlPerSec": None},
        "laser": {
            "armed": False,
            "frequency": None,
            "duration": None,
            "mode": "contingent",
            "phase": "reward",
            "contingency": "any",
            "onsetDelay": 0,
        },
        "lickCircuit": {"armed": False},
        "microscope": {"armed": False, "frameRate": None, "frameAveraging": None},
        "slm": {"armed": False, "pin": DEFAULT_SLM_PIN, "laserFrequency": None, "laserDuration": None},
    }
