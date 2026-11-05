"""Device tables, command codes and menu choices for the REACHER CLI."""

from __future__ import annotations

from typing import TypedDict

# Which presses start the lever timeout window (1077 RH / 1377 LH). Mirrors
# TIMEOUT_MODE_OPTIONS in web/src/components/hardware/LeverControl.tsx. Both codes
# write one scheduler-wide flag in firmware, exactly like the timeout interval —
# setting it on one lever sets it for both.
TIMEOUT_MODE_CHOICES: list[tuple[str, str]] = [
    ("Every active press", "0"),
    ("Reward-triggering press only", "1"),
]

LEVER_FILTER_CHOICES: list[tuple[str, str]] = [
    ("Any lever", "0"),
    ("RH lever only", "1"),
    ("LH lever only", "2"),
]



class _ParamRequired(TypedDict):
    key: str
    label: str
    code: int
    default: str


class ParamSpec(_ParamRequired, total=False):
    """One settable device parameter; ``choices`` is present for menu-picked values."""

    choices: list[tuple[str, str]]


class _DeviceRequired(TypedDict):
    id: str
    label: str
    arm: int
    disarm: int
    test: int | None
    params: list[ParamSpec]


class DeviceConfig(_DeviceRequired, total=False):
    """One hardware device: its command codes and parameters; levers add ``role``, the laser ``mode``."""

    role: dict[str, int]
    mode: dict[str, int]


DEVICE_CONFIGS: list[DeviceConfig] = [
    {
        "id": "rh-lever",
        "label": "RH Lever",
        "arm": 1001,
        "disarm": 1000,
        "test": None,
        "params": [
            {"key": "timeout", "label": "Timeout (ms)", "code": 1074, "default": "20000"},
            {
                "key": "timeoutMode",
                "label": "Timeout Mode",
                "code": 1077,
                "default": "Every press",
                "choices": TIMEOUT_MODE_CHOICES,
            },
            {"key": "ratio", "label": "Ratio", "code": 1075, "default": "1"},
        ],
        "role": {"active": 1081, "inactive": 1080},
    },
    {
        "id": "lh-lever",
        "label": "LH Lever",
        "arm": 1301,
        "disarm": 1300,
        "test": None,
        "params": [
            {"key": "timeout", "label": "Timeout (ms)", "code": 1374, "default": "20000"},
            {
                "key": "timeoutMode",
                "label": "Timeout Mode",
                "code": 1377,
                "default": "Every press",
                "choices": TIMEOUT_MODE_CHOICES,
            },
            {"key": "ratio", "label": "Ratio", "code": 1375, "default": "1"},
        ],
        "role": {"active": 1381, "inactive": 1380},
    },
    {
        "id": "primary-cue",
        "label": "Primary Cue",
        "arm": 301,
        "disarm": 300,
        "test": 303,
        "params": [
            {"key": "frequency", "label": "Frequency (Hz)", "code": 371, "default": "2900"},
            {"key": "duration", "label": "Duration (ms)", "code": 372, "default": "1000"},
            {
                "key": "leverFilter",
                "label": "Lever Filter",
                "code": 378,
                "default": "Any",
                "choices": LEVER_FILTER_CHOICES,
            },
            {"key": "delay", "label": "Onset Delay (ms)", "code": 377, "default": "0"},
        ],
    },
    {
        "id": "secondary-cue",
        "label": "Secondary Cue",
        "arm": 311,
        "disarm": 310,
        "test": 313,
        "params": [
            {"key": "frequency", "label": "Frequency (Hz)", "code": 381, "default": "2900"},
            {"key": "duration", "label": "Duration (ms)", "code": 382, "default": "1000"},
            {
                "key": "leverFilter",
                "label": "Lever Filter",
                "code": 388,
                "default": "Any",
                "choices": LEVER_FILTER_CHOICES,
            },
        ],
    },
    {
        "id": "primary-pump",
        "label": "Primary Pump",
        "arm": 401,
        "disarm": 400,
        "test": 403,
        "params": [
            {"key": "duration", "label": "Duration (ms)", "code": 472, "default": "3000"},
            {
                "key": "leverFilter",
                "label": "Lever Filter",
                "code": 478,
                "default": "Any",
                "choices": LEVER_FILTER_CHOICES,
            },
            {"key": "delay", "label": "Onset Delay (ms)", "code": 477, "default": "0"},
        ],
    },
    {
        "id": "secondary-pump",
        "label": "Secondary Pump",
        "arm": 411,
        "disarm": 410,
        "test": 413,
        "params": [
            {"key": "duration", "label": "Duration (ms)", "code": 482, "default": "3000"},
            {
                "key": "leverFilter",
                "label": "Lever Filter",
                "code": 488,
                "default": "Any",
                "choices": LEVER_FILTER_CHOICES,
            },
            {"key": "delay", "label": "Onset Delay (ms)", "code": 487, "default": "0"},
        ],
    },
    {
        "id": "laser",
        "label": "Laser",
        "arm": 601,
        "disarm": 600,
        "test": 603,
        "params": [
            {"key": "frequency", "label": "Frequency (Hz)", "code": 671, "default": "20"},
            {"key": "duration", "label": "Duration (ms)", "code": 672, "default": "10000"},
            {"key": "onsetDelay", "label": "Onset Delay (ms)", "code": 673, "default": "0"},
        ],
        "mode": {"contingent": 681, "independent": 682},
    },
    {
        "id": "lick-circuit",
        "label": "Lick Circuit",
        "arm": 501,
        "disarm": 500,
        "test": None,
        "params": [],
    },
    {
        "id": "microscope",
        "label": "Microscope",
        "arm": 901,
        "disarm": 900,
        "test": 903,
        "params": [],
    },
    {
        "id": "slm",
        "label": "SLM",
        "arm": 1101,
        "disarm": 1100,
        "test": None,
        "params": [
            {"key": "laserFrequency", "label": "Laser Frequency (Hz)", "code": 1102, "default": "-"},
            {"key": "laserDuration", "label": "Laser Duration (ms)", "code": 1103, "default": "-"},
        ],
    },
]

# Laser mode/phase commands offered in the laser device menu; filtered by what
# the running firmware declares. Pavlovian trial modes need 681 sent first
# (ConfigurationPanel.tsx does the same).
LASER_MODE_ITEMS: list[tuple[str, int]] = [
    ("Mode: contingent (any lever)", 681),
    ("Mode: independent", 682),
    ("Mode: RH lever only", 684),
    ("Mode: LH lever only", 685),
    ("Mode: CS+ trials", 691),
    ("Mode: CS- trials", 692),
    ("Mode: CS+ and CS- trials", 693),
    ("Phase: reward", 694),
    ("Phase: cue", 695),
]

LEVER_FILTER_LABELS = {"none": "Any lever", "rh": "RH lever only", "lh": "LH lever only"}

# Codes whose value lives in the session rather than one device. 201/1075/1375
# all write the one scheduler ratio; 1074/1374 the one timeout; 1077/1377 the
# one timeout mode (reacher commands.py), so the CLI records them once.
RATIO_CODES = (201, 1075, 1375)
TIMEOUT_CODES = (1074, 1374)
TIMEOUT_MODE_CODES = (1077, 1377)
ACTIVE_LEVER_CODES = {1081: "rh", 1381: "lh"}

PARADIGM_SETTING_CODES = {
    "ratio": 201,
    "step": 205,
    "vi_interval": 204,
    "om_interval": 203,
}

# Curated short labels for Pavlovian params. The param *list* is sourced
# dynamically from reacher's registry (see _pavlovian_menu); this map only
# supplies nicer labels than the registry's verbose `description`. A code missing
# here falls back to the spec's description, so new registry params still render.
PAV_LABEL_OVERRIDES: dict[int, str] = {
    206: "CS+ Reward Prob (%)",
    207: "CS- Reward Prob (%)",
    208: "CS+ Count",
    209: "CS- Count",
    210: "CS+ Frequency (Hz)",
    211: "CS- Frequency (Hz)",
    212: "Counterbalance",
    213: "Cue Duration (ms)",
    214: "Trace Interval (ms)",
    215: "Consumption Window (ms)",
    216: "ITI Mean (ms)",
    217: "ITI Min (ms)",
    218: "ITI Max (ms)",
    219: "Pulse Config",
    374: "CS+ Pulse On (ms)",
    375: "CS+ Pulse Off (ms)",
    384: "CS- Pulse On (ms)",
    385: "CS- Pulse Off (ms)",
}

# ITI parameter codes and the validity rule they must satisfy
# (mirrors `itiValid` in PavlovianSettings.tsx).
ITI_CODES = (216, 217, 218)
ITI_DEFAULTS = {216: 30000, 217: 10000, 218: 90000}

# Pulse-configuration codes — rendered as a dedicated block (0 = continuous tone).
# Mirrors PULSE_CODES in web/src/components/program/pavLabels.ts.
PULSE_CODES = (374, 375, 384, 385)

SYSTEM_COMMANDS = {"test_chain": 103, "test_mode": 104}

LIMIT_TYPES_OPERANT = ["Time", "Infusion", "Both"]
LIMIT_TYPES_PAVLOVIAN = ["Trials", "Infusion"]

# Devices whose INFUSION events count toward the local fallback count.
PUMP_DEVICES = ("PUMP", "PUMP_1", "PUMP_2")

# Counted-pump choice -> (label, backend value); None is Auto (follow the reward pump).
COUNTED_PUMP_CHOICES = {
    "auto": ("Auto (reward pump)", None),
    "pump1": ("Pump 1", ["PUMP_1"]),
    "pump2": ("Pump 2", ["PUMP_2"]),
    "both": ("Pump 1 + Pump 2", ["PUMP_1", "PUMP_2"]),
}

DEVICE_BY_ID: dict[str, DeviceConfig] = {d["id"]: d for d in DEVICE_CONFIGS}
