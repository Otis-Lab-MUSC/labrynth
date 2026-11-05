"""Public import surface for session presets, command dispatch and limits."""

from __future__ import annotations

from .preset_catalog import PRESET_BY_ID, SESSION_PRESETS, presets_for
from .preset_commands import preset_commands, start_commands
from .preset_hardware import default_hardware, record_command
from .preset_limits import (
    LIMIT_DEFAULTS,
    MAX_INFUSION_LIMIT,
    MAX_STOP_DELAY_S,
    MAX_TIME_LIMIT_S,
    LimitBody,
    LimitSettings,
    filter_allowed,
    limit_payload,
    missing_limit_fields,
    read_limit_number,
)
from .preset_merge import merge_controller_row, merge_firmware_row, merge_preset_hardware
from .preset_paradigm import (
    active_lever_of,
    base_paradigm,
    can_dispatch_param,
    is_operant,
    is_paradigm,
    is_shared_lever_param,
    reward_pump2,
)
from .preset_tables import (
    CLI_ID,
    DEVICE_TO_UI_KEY,
    LASER_MODE_COMMANDS,
    LEVER_COMMANDS,
    LEVER_FILTER_VALUES,
    PARAM_PARADIGMS,
    PAV_LASER_PHASE_COMMANDS,
    PRESET_COMMAND_MAP,
    SET_ACTIVE_PUMP,
    WEB_KEY,
    Command,
)
from .reacher_tables import CMD

__all__ = [
    "CLI_ID",
    "CMD",
    "DEVICE_TO_UI_KEY",
    "LASER_MODE_COMMANDS",
    "LEVER_COMMANDS",
    "LEVER_FILTER_VALUES",
    "LIMIT_DEFAULTS",
    "MAX_INFUSION_LIMIT",
    "MAX_STOP_DELAY_S",
    "MAX_TIME_LIMIT_S",
    "PARAM_PARADIGMS",
    "PAV_LASER_PHASE_COMMANDS",
    "PRESET_BY_ID",
    "PRESET_COMMAND_MAP",
    "SESSION_PRESETS",
    "SET_ACTIVE_PUMP",
    "WEB_KEY",
    "Command",
    "LimitBody",
    "LimitSettings",
    "active_lever_of",
    "base_paradigm",
    "can_dispatch_param",
    "default_hardware",
    "filter_allowed",
    "is_operant",
    "is_paradigm",
    "is_shared_lever_param",
    "limit_payload",
    "merge_controller_row",
    "merge_firmware_row",
    "merge_preset_hardware",
    "missing_limit_fields",
    "preset_commands",
    "presets_for",
    "read_limit_number",
    "record_command",
    "reward_pump2",
    "start_commands",
]
