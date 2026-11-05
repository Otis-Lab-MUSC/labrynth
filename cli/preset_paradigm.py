"""Paradigm and device-state helpers (web/src/lib/paradigm.ts)."""

from __future__ import annotations

from .preset_tables import PARAM_PARADIGMS
from .preset_types import Contingency, DeviceState, Hardware, ParadigmSettings

LITE_SUFFIX = "_lite"
OPERANT_BASES = ("fr", "pr", "vi", "omission")
LEVER_KEYS = ("rhLever", "lhLever")
SHARED_LEVER_PARAMS = ("timeout", "timeoutMode")
FILTERABLE_KEYS = ("primaryCue", "secondaryCue", "primaryPump", "secondaryPump")


def base_paradigm(paradigm: str | None) -> str | None:
    """Return the lowercase paradigm without its ``_lite`` suffix, or None."""
    if paradigm is None:
        return None
    p = paradigm.lower()
    return p.removesuffix(LITE_SUFFIX)


def is_paradigm(paradigm: str | None, *bases: str) -> bool:
    """Return True when the paradigm's base is one of *bases*."""
    base = base_paradigm(paradigm)
    return base is not None and base in bases


def is_operant(paradigm: str | None) -> bool:
    """Return True for the lever-press paradigms (everything except pavlovian)."""
    return is_paradigm(paradigm, *OPERANT_BASES)


def can_dispatch_param(param_key: str, paradigm: str | None) -> bool:
    """Return True when the paradigm declares this parameter."""
    allowed = PARAM_PARADIGMS.get(param_key)
    return allowed is None or is_paradigm(paradigm, *allowed)


def is_shared_lever_param(device_key: str, param_key: str) -> bool:
    """Return True for lever settings that the RH and LH levers share."""
    return device_key in LEVER_KEYS and param_key in SHARED_LEVER_PARAMS


def active_lever_of(paradigm_settings: ParadigmSettings | None) -> str:
    """Return ``"lh"`` or ``"rh"`` (the default) from the paradigm settings."""
    return "lh" if (paradigm_settings or {}).get("activeLever") == "lh" else "rh"


def reward_pump2(hw: Hardware) -> bool:
    """Return True when Pump 2 is the sole armed pump (the 221 value)."""
    return bool(hw.get("secondaryPump", {}).get("armed")) and not hw.get("primaryPump", {}).get("armed")


def as_int(value: object) -> int | None:
    """Return the value as an int when it is numeric (or a numeric string), else None."""
    return int(value) if isinstance(value, (int, float, str)) else None


def lever_filter_of(state: DeviceState) -> str | None:
    """Return the lever filter named by a device's contingency, if it has one."""
    contingency = state.get("contingency")
    return str(contingency["leverFilter"]) if isinstance(contingency, dict) and "leverFilter" in contingency else None


def contingency_of(state: DeviceState) -> Contingency:
    """Return the device's contingency, creating the default when it has none."""
    contingency = state.get("contingency")
    if isinstance(contingency, dict):
        return contingency
    created: Contingency = {"leverFilter": "none", "delay": 0}
    state["contingency"] = created
    return created


def filter_targets(hw: Hardware, lever: str) -> list[str]:
    """Return the armed cue and pump keys whose lever filter is *lever*."""
    return [k for k in FILTERABLE_KEYS if hw.get(k, {}).get("armed") and lever_filter_of(hw.get(k, {})) == lever]
