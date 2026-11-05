"""Command maps and key tables mirrored from the web's devicePresets.ts.

Data uses the web's own shape (camelCase device keys) so
``scripts/check-cli-parity.py`` can diff it against the TypeScript definitions.
Stdlib only: the parity check imports this without the CLI's runtime dependencies.
"""

from __future__ import annotations

from .preset_types import CommandSpec, LeverCodes
from .reacher_tables import CMD

Command = tuple[int, "int | None"]

LASER_MODE_COMMANDS: dict[str, int] = {
    "contingent": CMD["LASER_MODE_CONTINGENT"],
    "independent": CMD["LASER_MODE_INDEPENDENT"],
    "rh_lever": CMD["LASER_TRIGGER_RH_ONLY"],
    "lh_lever": CMD["LASER_TRIGGER_LH_ONLY"],
    "cs_plus": CMD["PAV_LASER_CS_PLUS"],
    "cs_minus": CMD["PAV_LASER_CS_MINUS"],
    "cs_both": CMD["PAV_LASER_CS_BOTH"],
}

PAV_LASER_PHASE_COMMANDS: dict[str, int] = {"reward": CMD["PAV_LASER_PHASE_REWARD"], "cue": CMD["PAV_LASER_PHASE_CUE"]}
PAV_LASER_MODE_BY_CODE: dict[int, str] = {
    CMD["PAV_LASER_CS_PLUS"]: "cs_plus",
    CMD["PAV_LASER_CS_MINUS"]: "cs_minus",
    CMD["PAV_LASER_CS_BOTH"]: "cs_both",
}
# Laser command code -> the mode and contingency it sets in local state.
LASER_MODE_BY_CODE_UPDATES: dict[int, dict[str, str]] = {
    CMD["LASER_MODE_CONTINGENT"]: {"mode": "contingent", "contingency": "any"},
    CMD["LASER_MODE_INDEPENDENT"]: {"mode": "independent", "contingency": "independent"},
    CMD["LASER_TRIGGER_RH_ONLY"]: {"mode": "rh_lever", "contingency": "rh"},
    CMD["LASER_TRIGGER_LH_ONLY"]: {"mode": "lh_lever", "contingency": "lh"},
}

PRESET_COMMAND_MAP: dict[str, CommandSpec] = {
    "rhLever": {
        "arm": CMD["LEVER_RH_ARM"],
        "disarm": CMD["LEVER_RH_DISARM"],
        "params": {"timeout": CMD["LEVER_RH_SET_TIMEOUT"], "timeoutMode": CMD["LEVER_RH_SET_TIMEOUT_MODE"]},
    },
    "lhLever": {
        "arm": CMD["LEVER_LH_ARM"],
        "disarm": CMD["LEVER_LH_DISARM"],
        "params": {"timeout": CMD["LEVER_LH_SET_TIMEOUT"], "timeoutMode": CMD["LEVER_LH_SET_TIMEOUT_MODE"]},
    },
    "primaryCue": {
        "arm": CMD["CUE_ARM"],
        "disarm": CMD["CUE_DISARM"],
        "params": {
            "frequency": CMD["CUE_SET_FREQUENCY"],
            "duration": CMD["CUE_SET_DURATION"],
            "leverFilter": CMD["CUE_SET_LEVER_FILTER"],
            "delay": CMD["CUE_SET_ONSET_DELAY"],
        },
    },
    "secondaryCue": {
        "arm": CMD["CUE2_ARM"],
        "disarm": CMD["CUE2_DISARM"],
        "params": {
            "frequency": CMD["CUE2_SET_FREQUENCY"],
            "duration": CMD["CUE2_SET_DURATION"],
            "leverFilter": CMD["CUE2_SET_LEVER_FILTER"],
        },
    },
    "primaryPump": {
        "arm": CMD["PUMP_ARM"],
        "disarm": CMD["PUMP_DISARM"],
        "params": {
            "duration": CMD["PUMP_SET_DURATION"],
            "leverFilter": CMD["PUMP_SET_LEVER_FILTER"],
            "delay": CMD["PUMP_SET_ONSET_DELAY"],
        },
    },
    "secondaryPump": {
        "arm": CMD["PUMP2_ARM"],
        "disarm": CMD["PUMP2_DISARM"],
        "params": {
            "duration": CMD["PUMP2_SET_DURATION"],
            "leverFilter": CMD["PUMP2_SET_LEVER_FILTER"],
            "delay": CMD["PUMP2_SET_ONSET_DELAY"],
        },
    },
    "laser": {
        "arm": CMD["LASER_ARM"],
        "disarm": CMD["LASER_DISARM"],
        "params": {
            "frequency": CMD["LASER_SET_FREQUENCY"],
            "duration": CMD["LASER_SET_DURATION"],
            "delay": CMD["LASER_SET_ONSET_DELAY"],
        },
    },
    "lickCircuit": {"arm": CMD["LICK_ARM"], "disarm": CMD["LICK_DISARM"]},
    "microscope": {"arm": CMD["MICROSCOPE_ARM"], "disarm": CMD["MICROSCOPE_DISARM"]},
    "slm": {
        "arm": CMD["SLM_ARM"],
        "disarm": CMD["SLM_DISARM"],
        "params": {"laserFrequency": CMD["SLM_SET_LASER_FREQUENCY"], "laserDuration": CMD["SLM_SET_LASER_DURATION"]},
    },
}

# Params the backend does not declare for every paradigm (PARAM_PARADIGMS).
PARAM_PARADIGMS: dict[str, list[str]] = {"timeoutMode": ["fr", "pr"]}

LEVER_COMMANDS: dict[str, LeverCodes] = {
    "rh": {
        "active": CMD["LEVER_RH_SET_ACTIVE"],
        "inactive": CMD["LEVER_RH_SET_INACTIVE"],
        "timeout": CMD["LEVER_RH_SET_TIMEOUT"],
        "timeoutMode": CMD["LEVER_RH_SET_TIMEOUT_MODE"],
        "key": "rhLever",
    },
    "lh": {
        "active": CMD["LEVER_LH_SET_ACTIVE"],
        "inactive": CMD["LEVER_LH_SET_INACTIVE"],
        "timeout": CMD["LEVER_LH_SET_TIMEOUT"],
        "timeoutMode": CMD["LEVER_LH_SET_TIMEOUT_MODE"],
        "key": "lhLever",
    },
}

SET_ACTIVE_PUMP = CMD["SET_ACTIVE_PUMP"]
LEVER_FILTER_VALUES = {"none": 0, "rh": 1, "lh": 2}
LEVER_FILTER_NAMES = {0: "none", 1: "rh", 2: "lh"}

# Laser contingency (operant paradigms) -> laser mode name.
LASER_MODE_BY_CONTINGENCY: dict[str, str] = {
    "any": "contingent",
    "rh": "rh_lever",
    "lh": "lh_lever",
    "independent": "independent",
}
# Pavlovian laser modes that need no CS-mode preamble command.
LASER_MODES_WITHOUT_PREAMBLE = ("independent", "contingent", "rh_lever", "lh_lever")

# Firmware config-record device names -> web device keys
# (DEVICE_TO_UI_KEY in web/src/hooks/useSessionWebSockets.ts).
DEVICE_TO_UI_KEY: dict[str, str] = {
    "CUE": "primaryCue",
    "CUE2": "secondaryCue",
    "PUMP": "primaryPump",
    "PUMP2": "secondaryPump",
    "LASER": "laser",
    "LICK": "lickCircuit",
    "MICROSCOPE": "microscope",
    "LEVER_RH": "rhLever",
    "LEVER_LH": "lhLever",
    "SLM": "slm",
}

# Web device keys <-> the CLI's kebab-case device ids (DEVICE_CONFIGS in app.py).
CLI_ID: dict[str, str] = {
    "rhLever": "rh-lever",
    "lhLever": "lh-lever",
    "primaryCue": "primary-cue",
    "secondaryCue": "secondary-cue",
    "primaryPump": "primary-pump",
    "secondaryPump": "secondary-pump",
    "laser": "laser",
    "lickCircuit": "lick-circuit",
    "microscope": "microscope",
    "slm": "slm",
}
WEB_KEY: dict[str, str] = {v: k for k, v in CLI_ID.items()}
