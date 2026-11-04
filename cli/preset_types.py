"""Typed shapes for session presets and device state.

Records with a fixed set of keys are TypedDicts. The hardware tree, the
paradigm settings and the contingency are read and written by computed key
(``hw[key][param]``), which a TypedDict cannot express, and mypy does not narrow
a TypedDict with ``isinstance(value, dict)``, so those are typed aliases
instead. Keys keep the web's camelCase so ``scripts/check-cli-parity.py`` can
diff them against the TypeScript definitions.
"""

from __future__ import annotations

from typing import TypedDict, Union

Contingency = dict[str, Union[str, int]]
"""Lever filter and onset delay that gate a cue or pump."""

DeviceValue = Union[bool, int, str, None, Contingency]
DeviceState = dict[str, DeviceValue]
Hardware = dict[str, DeviceState]
ParadigmSettings = dict[str, Union[int, str]]


class CommandSpec(TypedDict, total=False):
    """Arm and disarm codes for one device, plus the codes of its settable parameters."""

    arm: int
    disarm: int
    params: dict[str, int]


class LeverCodes(TypedDict):
    """Firmware command codes for one lever, and the web key of its device state."""

    active: int
    inactive: int
    timeout: int
    timeoutMode: int
    key: str


class _LimitRequired(TypedDict):
    limitType: str
    timeLimit: int
    infusionLimit: int
    delay: int


class LimitDefaults(_LimitRequired, total=False):
    """Session limits a preset starts with; ``countedPumps`` is optional."""

    countedPumps: list[str]


class _PresetRequired(TypedDict):
    id: str
    name: str
    menuLabel: str
    paradigm: str
    hardware: Hardware
    paradigmSettings: ParadigmSettings
    limitDefaults: LimitDefaults


class Preset(_PresetRequired, total=False):
    """One built-in session preset; Pavlovian presets also carry firmware parameters."""

    pavlovianParams: dict[int, int]
