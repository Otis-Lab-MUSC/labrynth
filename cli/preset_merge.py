"""Merge firmware config records and preset hardware into local state."""

from __future__ import annotations

import copy
from collections.abc import Mapping

from .preset_hardware import CONFIG_NUMERIC_FIELDS
from .preset_paradigm import LEVER_KEYS, active_lever_of
from .preset_tables import DEVICE_TO_UI_KEY, PRESET_COMMAND_MAP
from .preset_types import DeviceState, Hardware, ParadigmSettings, Preset

SHARED_ROW_DEVICES = ("LEVER_RH", "LEVER_LH", "CONTROLLER")


def merge_shared_lever_row(hw: Hardware, row: Mapping[str, object]) -> None:
    """Copy a record's lever timeout and timeout mode onto both levers."""
    shared: DeviceState = {}
    timeout = row.get("timeout")
    if isinstance(timeout, (int, float)) and not isinstance(timeout, bool):
        shared["timeout"] = int(timeout)
    timeout_mode = row.get("timeout_mode")
    if isinstance(timeout_mode, (int, float)) and not isinstance(timeout_mode, bool):
        shared["timeoutMode"] = int(timeout_mode)
    for k in LEVER_KEYS:
        hw.setdefault(k, {}).update(shared)


def merge_firmware_row(hw: Hardware, row: Mapping[str, object]) -> str | None:
    """Fold one firmware config record into ``hw`` like the web's config handler.

    Returns the web device key that changed, or None.
    """
    device = str(row.get("device", ""))
    if device in SHARED_ROW_DEVICES:
        merge_shared_lever_row(hw, row)
    key = DEVICE_TO_UI_KEY.get(device)
    if not key or key not in hw:
        return None
    cur = hw[key]
    armed = row.get("armed")
    if isinstance(armed, bool):
        cur["armed"] = armed
    for f in CONFIG_NUMERIC_FIELDS:
        v = row.get(f)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            cur[f] = int(v)
    return key


def merge_controller_row(paradigm_settings: ParadigmSettings, row: Mapping[str, object]) -> None:
    """Pick scheduler-wide values (ratio, active lever) out of a CONTROLLER record."""
    if row.get("device") != "CONTROLLER":
        return
    ratio = row.get("ratio")
    if isinstance(ratio, int) and not isinstance(ratio, bool):
        paradigm_settings["ratio"] = ratio
    lever = str(row.get("active_lever", "")).lower()
    if lever in ("rh", "lh"):
        paradigm_settings["activeLever"] = lever


def merge_preset_hardware(hw: Hardware, preset: Preset) -> Hardware:
    """applySessionPreset step 1: full-takeover merge of preset hardware."""
    out = copy.deepcopy(hw)
    for key, value in preset["hardware"].items():
        if key not in out:
            continue
        armed = value.get("armed")
        if armed is False:
            out[key] = {**out[key], "armed": False}
        else:
            out[key] = {**out[key], **copy.deepcopy(value), "armed": armed}
    for key in PRESET_COMMAND_MAP:
        if key not in preset["hardware"] and key in out:
            out[key]["armed"] = False
    src = out["lhLever" if active_lever_of(preset.get("paradigmSettings")) == "lh" else "rhLever"]
    for k in LEVER_KEYS:
        out[k] = {**out[k], "timeout": src.get("timeout"), "timeoutMode": src.get("timeoutMode")}
    return out
