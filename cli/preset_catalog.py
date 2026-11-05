"""Built-in session preset data and builders, mirroring the web's preset files."""

from __future__ import annotations

from .preset_types import Contingency, DeviceState, Hardware, LimitDefaults, ParadigmSettings, Preset


def _cont(lever_filter: str, delay: int) -> Contingency:
    return {"leverFilter": lever_filter, "delay": delay}


_FR_CORE: Hardware = {
    "rhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
    "lhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
    "primaryCue": {"armed": True, "frequency": 8000, "duration": 1600, "contingency": _cont("rh", 0)},
}
_FR_PUMP: Hardware = {
    "primaryPump": {"armed": True, "duration": 2000, "contingency": _cont("rh", 1600), "flowRateUlPerSec": None},
}
_FR_OPTIONAL: Hardware = {
    "laser": {
        "armed": False,
        "frequency": 40,
        "duration": 5000,
        "mode": "contingent",
        "contingency": "any",
        "onsetDelay": 0,
    },
    "lickCircuit": {"armed": False},
    "microscope": {"armed": False, "frameRate": None, "frameAveraging": None},
    "slm": {"armed": False, "pin": 11, "laserFrequency": None, "laserDuration": None},
    "secondaryCue": {"armed": False, "frequency": 2900, "duration": 1000, "contingency": _cont("none", 0)},
    "secondaryPump": {"armed": False, "duration": 3000, "contingency": _cont("none", 0), "flowRateUlPerSec": None},
}
_FR_LITE_OPTIONAL: Hardware = {k: v for k, v in _FR_OPTIONAL.items() if k not in ("microscope", "slm")}
_FR_SETTINGS: ParadigmSettings = {"ratio": 1, "step": 1, "interval": 30000}


def _limits(limit_type: str, time_limit: int, infusion_limit: int, delay: int = 10) -> LimitDefaults:
    return {"limitType": limit_type, "timeLimit": time_limit, "infusionLimit": infusion_limit, "delay": delay}


def _sa(pid: str, name: str, label: str, paradigm: str, optional: Hardware, infusions: int) -> Preset:
    return {
        "id": pid,
        "name": name,
        "menuLabel": label,
        "paradigm": paradigm,
        "hardware": {**_FR_CORE, **_FR_PUMP, **optional},
        "paradigmSettings": _FR_SETTINGS,
        "limitDefaults": _limits("Both", 3600, infusions),
    }


def _extinction(pid: str, name: str, paradigm: str, optional: Hardware, pump_flow: bool) -> Preset:
    pump: DeviceState = {"armed": False, "duration": 2000, "contingency": _cont("none", 1600)}
    if pump_flow:
        pump["flowRateUlPerSec"] = None
    return {
        "id": pid,
        "name": name,
        "menuLabel": "SA Extinction",
        "paradigm": paradigm,
        "hardware": {
            "rhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
            "lhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
            "primaryCue": {"armed": False, "frequency": 8000, "duration": 1600, "contingency": _cont("none", 0)},
            "primaryPump": pump,
            **optional,
        },
        "paradigmSettings": _FR_SETTINGS,
        "limitDefaults": _limits("Time", 3600, 30),
    }


_PAV_CORE: Hardware = {
    "primaryCue": {"armed": True, "frequency": 12000, "duration": 2000, "contingency": _cont("none", 0)},
    "secondaryCue": {"armed": True, "frequency": 3000, "duration": 2000, "contingency": _cont("none", 0)},
    "primaryPump": {"armed": True, "duration": 2000, "contingency": _cont("none", 0), "flowRateUlPerSec": None},
}
_PAV_LASER: DeviceState = {
    "armed": True,
    "frequency": 40,
    "duration": 5000,
    "mode": "cs_plus",
    "phase": "reward",
    "contingency": "any",
    "onsetDelay": 0,
}
_PAV_OPTIONAL: Hardware = {
    "laser": {**_PAV_LASER, "armed": False},
    "lickCircuit": {"armed": True},
    "microscope": {"armed": False, "frameRate": None, "frameAveraging": None},
    "slm": {"armed": False, "pin": 11, "laserFrequency": None, "laserDuration": None},
}
_PAV_PARAMS_COMMON: dict[int, int] = {
    208: 50,
    209: 50,
    210: 12000,
    211: 3000,
    212: 0,
    213: 2000,
    214: 1000,
    215: 5000,
    216: 30000,
    217: 20000,
    218: 50000,
    219: 0,
    374: 0,
    375: 0,
    384: 200,
    385: 200,
}


def _pav(pid: str, name: str, label: str, cs_plus_prob: int, cs_minus_prob: int) -> Preset:
    return {
        "id": pid,
        "name": name,
        "menuLabel": label,
        "paradigm": "pavlovian",
        "hardware": {**_PAV_CORE, **_PAV_OPTIONAL, "laser": dict(_PAV_LASER), "lickCircuit": {"armed": True}},
        "paradigmSettings": {"ratio": 1, "step": 1, "interval": 0},
        "pavlovianParams": {206: cs_plus_prob, 207: cs_minus_prob, **_PAV_PARAMS_COMMON},
        "limitDefaults": _limits("Trials", 7200, 100),
    }


SESSION_PRESETS: list[Preset] = [
    _sa("sa-high", "Self-Administration - High Day", "SA High", "fr", _FR_OPTIONAL, 10),
    _sa("sa-mid", "Self-Administration - Mid Day", "SA Mid", "fr", _FR_OPTIONAL, 20),
    _sa("sa-low", "Self-Administration - Low Day", "SA Low", "fr", _FR_OPTIONAL, 40),
    _extinction("sa-extinction", "Self-Administration - Extinction", "fr", _FR_OPTIONAL, True),
    _sa("sa-high-lite", "Self-Administration - High Day (Lite)", "SA High", "fr_lite", _FR_LITE_OPTIONAL, 10),
    _sa("sa-mid-lite", "Self-Administration - Mid Day (Lite)", "SA Mid", "fr_lite", _FR_LITE_OPTIONAL, 20),
    _sa("sa-low-lite", "Self-Administration - Low Day (Lite)", "SA Low", "fr_lite", _FR_LITE_OPTIONAL, 40),
    _extinction("sa-extinction-lite", "Self-Administration - Extinction (Lite)", "fr_lite", _FR_LITE_OPTIONAL, False),
    _pav("pav-acquisition", "Pavlovian - Acquisition", "Acquisition", 100, 0),
    _pav("pav-reversal", "Pavlovian - Reversal", "Reversal", 0, 100),
]

PRESET_BY_ID: dict[str, Preset] = {p["id"]: p for p in SESSION_PRESETS}


def presets_for(paradigm: str | None) -> list[Preset]:
    """Built-in presets offered for a session (exact paradigm match, as the web does)."""
    p = (paradigm or "").lower()
    return [preset for preset in SESSION_PRESETS if preset["paradigm"] == p]
