"""REACHER CLI — Menu-driven terminal interface.

Arrow-key navigable menus with text prompts for input and live event
streaming.  Communicates with the REACHER backend over REST + WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Callable

from prompt_toolkit import Application
from prompt_toolkit.buffer import Buffer
from prompt_toolkit.formatted_text import FormattedText
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.layout import HSplit, Layout, Window
from prompt_toolkit.layout.controls import BufferControl, FormattedTextControl
from prompt_toolkit.styles import Style

from . import presets as P
from .client import ReacherClient

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _digits(code: str) -> str:
    """Pairing codes are shown as ``482-091``; the backend wants ``482091``."""
    return "".join(ch for ch in code if ch.isdigit())


def _limits_from_preset(limit_defaults: dict) -> dict:
    """Web ``limitDefaults`` (camelCase) -> the CLI's backend-shaped limits."""
    return {
        "type": limit_defaults.get("limitType", "Time"),
        "time_limit": int(limit_defaults.get("timeLimit", 3600)),
        "infusion_limit": int(limit_defaults.get("infusionLimit", 30)),
        "delay": int(limit_defaults.get("delay", 10)),
    }


def _safe_int(val: str, label: str = "value") -> int | None:
    """Parse *val* as int, returning None on failure (for user-facing prompts)."""
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════

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

DEVICE_CONFIGS: list[dict] = [
    {
        "id": "rh-lever",
        "label": "RH Lever",
        "arm": 1001,
        "disarm": 1000,
        "test": None,
        "params": [
            {"key": "timeout", "label": "Timeout (ms)", "code": 1074, "default": "20000"},
            {"key": "timeoutMode", "label": "Timeout Mode", "code": 1077, "default": "Every press",
             "choices": TIMEOUT_MODE_CHOICES},
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
            {"key": "timeoutMode", "label": "Timeout Mode", "code": 1377, "default": "Every press",
             "choices": TIMEOUT_MODE_CHOICES},
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
            {"key": "leverFilter", "label": "Lever Filter", "code": 378, "default": "Any",
             "choices": LEVER_FILTER_CHOICES},
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
            {"key": "leverFilter", "label": "Lever Filter", "code": 388, "default": "Any",
             "choices": LEVER_FILTER_CHOICES},
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
            {"key": "leverFilter", "label": "Lever Filter", "code": 478, "default": "Any",
             "choices": LEVER_FILTER_CHOICES},
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
            {"key": "leverFilter", "label": "Lever Filter", "code": 488, "default": "Any",
             "choices": LEVER_FILTER_CHOICES},
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

DEVICE_BY_ID = {d["id"]: d for d in DEVICE_CONFIGS}

# ═══════════════════════════════════════════════════════════════════════════
# Session state
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class SessionState:
    id: str
    port: str
    paradigm: str | None = None
    board: str | None = None
    state: str = "idle"
    name: str = ""
    notes: str = ""
    firmware_info: dict | None = None
    behavior_data: list[dict] = field(default_factory=list)
    frame_data: list[float] = field(default_factory=list)
    infusion_count: int = 0
    press_count: int = 0
    trial_count: int = 0
    rh_counts: dict = field(default_factory=lambda: {"active": 0, "timeout": 0, "inactive": 0})
    lh_counts: dict = field(default_factory=lambda: {"active": 0, "timeout": 0, "inactive": 0})
    program_start: float | None = None
    program_end: float | None = None
    paused_time: float = 0
    pause_start: float | None = None
    # Device state in the web's shape (camelCase keys, nested contingency), so
    # the start-time dispatch in presets.py is shared with the web definitions.
    hw: dict = field(default_factory=P.default_hardware)
    test_mode: bool = False
    paradigm_settings: dict = field(
        default_factory=lambda: {"ratio": 1, "step": 1, "interval": 30000}
    )
    pavlovian_params: dict = field(default_factory=dict)  # {code: value}, last-set Pavlovian params
    limit_settings: dict = field(
        default_factory=lambda: {"type": "Time", "time_limit": 3600, "infusion_limit": 30, "delay": 10}
    )
    file_config: dict = field(default_factory=lambda: {"filename": "", "destination": "", "notes": ""})
    backend_event_count: int = 0
    # Pavlovian command specs sourced from reacher's registry (get_commands_for_paradigm)
    pav_commands: list[dict] = field(default_factory=list)
    # True when the running firmware exposes EXT_TRIGGER_ARM (1201). Sniffed from
    # the same command list rather than the board name, since a "_lite" build on
    # any board omits it.
    has_external_trigger: bool = False
    frame_count: int = 0
    cs_plus_count: int = 0
    cs_minus_count: int = 0
    # Last export: path on the host that ran the session, and the local copy.
    last_export: str | None = None
    last_download: str | None = None
    exporting: bool = False
    attached: bool = False  # re-attached to a session this process did not create

    @property
    def armed(self) -> dict:
        """CLI device id -> armed, read-only view over ``hw``."""
        return {cli: bool(self.hw.get(web, {}).get("armed")) for web, cli in P.CLI_ID.items()}

    def behavior_count_hint(self) -> bool:
        return self.backend_event_count > 0

    @property
    def allowed_codes(self) -> set[int]:
        return {int(c["code"]) for c in self.pav_commands if "code" in c}

    @property
    def elapsed(self) -> float:
        if self.program_start is None:
            return 0.0
        end = self.program_end or time.time()
        extra = 0.0
        if self.pause_start is not None:
            extra = time.time() - self.pause_start
        return max(0.0, end - self.program_start - self.paused_time - extra)

    @property
    def elapsed_str(self) -> str:
        if self.program_start is None and self.attached and self.state in ("running", "paused"):
            return "--:--:--"
        s = int(self.elapsed)
        return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


# ═══════════════════════════════════════════════════════════════════════════
# Menu model
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class MenuItem:
    label: str
    action: Callable | None = None  # async callable, or None for separator
    suffix: str = ""                # right-aligned info
    is_separator: bool = False


@dataclass
class MenuState:
    title: str
    items: list[MenuItem]
    selected: int = 0
    parent: MenuState | None = None

    def selectable_count(self) -> int:
        return sum(1 for i in self.items if not i.is_separator)

    def move(self, delta: int) -> None:
        if not self.items:
            return
        n = len(self.items)
        idx = self.selected
        for _ in range(n):
            idx = (idx + delta) % n
            if not self.items[idx].is_separator:
                break
        self.selected = idx


# ═══════════════════════════════════════════════════════════════════════════
# Styling
# ═══════════════════════════════════════════════════════════════════════════

CLI_STYLE = Style.from_dict({
    "header": "bold fg:ansicyan",
    "header-status": "fg:ansigreen",
    "header-disconnected": "fg:ansired",
    "breadcrumb": "bold fg:ansiwhite",
    "separator": "fg:ansibrightblack",
    "item": "fg:ansiwhite",
    "item-selected": "bold fg:ansiblack bg:ansicyan",
    "item-suffix": "fg:ansibrightblack",
    "item-suffix-selected": "fg:ansiblack bg:ansicyan",
    "item-separator": "fg:ansiyellow",
    "help-bar": "fg:ansibrightblack",
    "status-bar": "fg:ansiyellow",
    "status-bar-error": "fg:ansired",
    "input-prompt": "bold fg:ansicyan",
    "input-text": "fg:ansiwhite",
    "monitor-header": "bold fg:ansicyan",
    "monitor-stats": "bold fg:ansiwhite",
    "monitor-event": "fg:ansiwhite",
    "monitor-time": "fg:ansibrightblack",
    "header-target": "bold fg:ansimagenta",
})


# ═══════════════════════════════════════════════════════════════════════════
# ReacherCLI
# ═══════════════════════════════════════════════════════════════════════════


class ReacherCLI:
    def __init__(self, port: int = 6229, machine: str | None = None):
        # Always the LOCAL backend. A remote machine is reached through its
        # proxy (see ReacherClient.set_target), so the Pi's key never leaves it.
        self.api = ReacherClient(base_url=f"http://localhost:{port}")
        self.port = port
        self.target_name: str = "this machine"
        self._startup_machine = machine
        self.machines: list[dict] = []
        self.session: SessionState | None = None
        self.mode: str = "menu"  # "menu" | "input" | "monitor" | "select"
        self.status_message: str = ""
        self.status_is_error: bool = False

        # Input mode state
        self.input_prompt: str = ""
        self.input_value: str = ""
        self.input_callback: Callable | None = None
        self.input_mask: bool = False

        # Select mode state (arrow-key selection from a list)
        self.select_title: str = ""
        self.select_options: list[tuple[str, str]] = []  # (label, value)
        self.select_index: int = 0
        self.select_callback: Callable | None = None

        # Live feed. One WebSocket per session runs in the background for the
        # whole time a session is open (not only in Monitor mode): it keeps
        # state/arm/counter mirrors current and lets the host's idle watchdog
        # see a connected client during long runs.
        self.monitor_lines: list[tuple[str, str]] = []
        self._ws_task: asyncio.Task | None = None
        self.ws_connected: bool = False

        # Menu
        self.menu: MenuState = self._main_menu()

        # prompt_toolkit app (set up in run_async)
        self.app: Application | None = None

    # ───────────────────────────────────────────────────────────────────
    # Rendering
    # ───────────────────────────────────────────────────────────────────

    def _render(self) -> FormattedText:
        lines: list[tuple[str, str]] = []

        # Header: target machine, session state, live-link indicator
        s = self.session
        if s:
            status = f"[{s.state}]" + ("" if self.ws_connected else " [no live link]")
            style = "class:header-disconnected" if (s.state == "disconnected" or not self.ws_connected) \
                else "class:header-status"
        else:
            status, style = "[no session]", "class:header-disconnected"
        lines.append(("class:header", "REACHER CLI  "))
        lines.append(("class:header-target", f"@ {self.target_name}  "))
        lines.append((style, status))
        lines.append(("", "\n"))

        if self.mode == "monitor":
            self._render_monitor(lines)
        elif self.mode == "input":
            self._render_input(lines)
        elif self.mode == "select":
            self._render_select(lines)
        else:
            self._render_menu(lines)

        return FormattedText(lines)

    def _render_menu(self, lines: list[tuple[str, str]]) -> None:
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:breadcrumb", self.menu.title))
        lines.append(("", "\n"))
        lines.append(("class:separator", "\u2500" * 50 + "\n"))

        for i, item in enumerate(self.menu.items):
            if item.is_separator:
                lines.append(("class:item-separator", f"  {item.label}\n"))
                continue
            selected = i == self.menu.selected
            prefix = " > " if selected else "   "
            style = "class:item-selected" if selected else "class:item"
            suffix_style = "class:item-suffix-selected" if selected else "class:item-suffix"
            label = item.label
            suffix = item.suffix
            if suffix:
                pad = max(1, 48 - len(prefix) - len(label) - len(suffix))
                lines.append((style, f"{prefix}{label}"))
                lines.append((suffix_style, f"{' ' * pad}{suffix}"))
                lines.append(("", "\n"))
            else:
                lines.append((style, f"{prefix}{label}\n"))

        lines.append(("", "\n"))
        lines.append(("class:help-bar", "[Up/Down] Navigate  [Enter] Select  [Esc] Back  [q] Quit\n"))
        self._render_status(lines)

    def _render_input(self, lines: list[tuple[str, str]]) -> None:
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:input-prompt", self.input_prompt))
        lines.append(("", "\n\n"))
        shown = "*" * len(self.input_value) if self.input_mask else self.input_value
        lines.append(("class:input-text", f"  > {shown}_\n"))
        lines.append(("", "\n"))
        lines.append(("class:help-bar", "[Enter] Submit  [Esc] Cancel\n"))
        self._render_status(lines)

    def _render_select(self, lines: list[tuple[str, str]]) -> None:
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:breadcrumb", self.select_title))
        lines.append(("", "\n"))
        lines.append(("class:separator", "\u2500" * 50 + "\n"))

        for i, (label, _val) in enumerate(self.select_options):
            selected = i == self.select_index
            prefix = " > " if selected else "   "
            style = "class:item-selected" if selected else "class:item"
            lines.append((style, f"{prefix}{label}\n"))

        lines.append(("", "\n"))
        lines.append(("class:help-bar", "[Up/Down] Navigate  [Enter] Select  [Esc] Cancel\n"))
        self._render_status(lines)

    def _render_monitor(self, lines: list[tuple[str, str]]) -> None:
        s = self.session
        elapsed = s.elapsed_str if s else "00:00:00"
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:monitor-header", f"Live Monitor                    Elapsed: {elapsed}\n"))
        lines.append(("class:separator", "\u2500" * 50 + "\n"))

        if s:
            if P.base_paradigm(s.paradigm) == "pavlovian":
                stats = (f"  Trials: {s.trial_count} (CS+ {s.cs_plus_count} / CS- {s.cs_minus_count})"
                         f"  |  Infusions: {s.infusion_count}")
            else:
                rh, lh = s.rh_counts, s.lh_counts
                stats = (f"  Infusions: {s.infusion_count}  |  Presses: {s.press_count}"
                         f"  (RH {rh.get('active', 0)}/{rh.get('timeout', 0)}/{rh.get('inactive', 0)}"
                         f"  LH {lh.get('active', 0)}/{lh.get('timeout', 0)}/{lh.get('inactive', 0)})")
            if s.frame_count:
                stats += f"  |  Frames: {s.frame_count}"
            lines.append(("class:monitor-stats", stats + f"  |  State: {s.state}\n"))
            lines.append(("", "\n"))

        # Show last N lines (tail)
        visible = self.monitor_lines[-30:]
        for style, text in visible:
            lines.append((style, f"  {text}\n"))

        if not visible:
            lines.append(("class:separator", "  Waiting for events...\n"))

        lines.append(("", "\n"))
        lines.append(("class:help-bar", "[Esc] Exit monitor (the live link stays open)\n"))
        self._render_status(lines)

    def _render_status(self, lines: list[tuple[str, str]]) -> None:
        if self.status_message:
            style = "class:status-bar-error" if self.status_is_error else "class:status-bar"
            lines.append((style, self.status_message + "\n"))

    def _invalidate(self) -> None:
        if self.app:
            self.app.invalidate()

    def _set_status(self, msg: str, error: bool = False) -> None:
        self.status_message = msg
        self.status_is_error = error
        self._invalidate()

    # ───────────────────────────────────────────────────────────────────
    # Menu builders
    # ───────────────────────────────────────────────────────────────────

    def _main_menu(self) -> MenuState:
        items = [
            MenuItem("Machines", action=self._open_machines_menu, suffix=f"({self.target_name})"),
            MenuItem("Session", action=lambda: self._push_menu(self._session_menu())),
            MenuItem("Hardware", action=lambda: self._push_menu(self._hardware_menu())),
            MenuItem("Program", action=lambda: self._push_menu(self._program_menu())),
            MenuItem("Monitor", action=lambda: self._push_menu(self._monitor_menu())),
            MenuItem("Data", action=lambda: self._push_menu(self._data_menu())),
            MenuItem("Quit", action=self._quit),
        ]
        return MenuState(title="Main Menu", items=items)

    def _session_menu(self) -> MenuState:
        s = self.session
        state_suffix = f"[{s.state}]" if s else ""
        items = [
            MenuItem("Create New Session", action=self._create_session),
            MenuItem("Attach to Existing Session", action=self._choose_attach),
            MenuItem("Connect", action=self._connect,
                     suffix="[connected]" if s and s.state == "connected" else ""),
            MenuItem("Disconnect", action=self._disconnect),
            MenuItem("Upload Firmware", action=self._upload_firmware),
            MenuItem("Reset Session", action=self._reset_session),
            MenuItem("Detach (leave session running)", action=self._detach),
            MenuItem("Destroy Session", action=self._destroy_session),
            MenuItem("Session Info", action=self._show_session_info, suffix=state_suffix),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Session", items=items)

    def _hardware_menu(self) -> MenuState:
        items = []
        allowed = self.session.allowed_codes if self.session else set()
        for cfg in DEVICE_CONFIGS:
            # Hide devices the running firmware does not have (e.g. microscope
            # and SLM on _lite builds); show everything until commands load.
            if allowed and cfg["arm"] not in allowed:
                continue
            armed = self.session.armed.get(cfg["id"], False) if self.session else False
            suffix = "[ARMED]" if armed else ""
            dev_id = cfg["id"]
            items.append(MenuItem(
                cfg["label"],
                action=lambda d=dev_id: self._push_menu(self._device_menu(d)),
                suffix=suffix,
            ))
        items.append(MenuItem("\u2500\u2500\u2500\u2500 System \u2500\u2500\u2500\u2500", is_separator=True))
        items.append(MenuItem("Test Chain", action=self._test_chain))
        test_mode = self.session.test_mode if self.session else False
        items.append(MenuItem(
            "Test Mode Off" if test_mode else "Test Mode On",
            action=self._toggle_test_mode,
            suffix="[ON]" if test_mode else "",
        ))
        items.append(MenuItem("Back", action=self._pop_menu))
        armed_lock = bool(self.session and self.session.state == "armed")
        title = "Hardware  [LOCKED — armed]" if armed_lock else "Hardware"
        return MenuState(title=title, items=items)

    def _param_value(self, device_id: str, key: str) -> str:
        """Current value of a device param, for the menu suffix."""
        if not self.session:
            return ""
        dev = self.session.hw.get(P.WEB_KEY.get(device_id, ""), {})
        if key == "leverFilter":
            return LEVER_FILTER_LABELS.get((dev.get("contingency") or {}).get("leverFilter", "none"), "?")
        if key == "delay":
            v = (dev.get("contingency") or {}).get("delay")
        elif key == "timeoutMode":
            v = dev.get("timeoutMode")
            return {0: "Every press", 1: "Reward press"}.get(v, "unknown") if v is not None else "unknown"
        else:
            v = dev.get(key)
        return "unknown" if v is None else str(v)

    def _device_menu(self, device_id: str) -> MenuState:
        cfg = DEVICE_BY_ID[device_id]
        s = self.session
        armed = s.armed.get(device_id, False) if s else False
        allowed = s.allowed_codes if s else set()
        items = []

        # Arm/disarm toggle
        if armed:
            items.append(MenuItem("Disarm", action=lambda: self._send_hw_command(cfg["disarm"])))
        else:
            items.append(MenuItem("Arm", action=lambda: self._send_hw_command(cfg["arm"])))

        # Test button
        if cfg.get("test") is not None and (not allowed or cfg["test"] in allowed):
            items.append(MenuItem("Test", action=lambda: self._send_hw_command(cfg["test"])))

        # Parameters the running firmware declares (lever filter and onset
        # delay exist only on operant builds; timeout mode not on omission).
        for p in cfg.get("params", []):
            if allowed and p["code"] not in allowed:
                continue
            if p.get("choices"):
                action = lambda code=p["code"], lbl=p["label"], ch=p["choices"]: self._prompt_select(
                    f"{lbl}:", ch, lambda val, c=code: self._send_hw_command(c, int(val))
                )
            else:
                action = lambda code=p["code"], lbl=p["label"]: self._prompt_int_input(
                    f"Enter {lbl}:", lambda val, c=code: self._send_hw_command(c, val)
                )
            items.append(MenuItem(f"Set {p['label']}", action=action,
                                  suffix=f"({self._param_value(device_id, p['key'])})"))

        # Role (levers)
        if "role" in cfg:
            items.append(MenuItem("Set Active",
                                  action=lambda: self._send_hw_command(cfg["role"]["active"])))
            items.append(MenuItem("Set Inactive",
                                  action=lambda: self._send_hw_command(cfg["role"]["inactive"])))

        # Mode / phase (laser), filtered to what this firmware accepts
        if device_id == "laser":
            laser = s.hw["laser"] if s else {}
            items.append(MenuItem(
                f"──── Mode: {laser.get('mode', '?')}  phase: {laser.get('phase', '?')} ────",
                is_separator=True))
            for label, code in LASER_MODE_ITEMS:
                if allowed and code not in allowed:
                    continue
                items.append(MenuItem(label, action=lambda c=code: self._send_laser_mode(c)))

        items.append(MenuItem("Back", action=self._pop_menu))

        title = f"Hardware > {cfg['label']}"
        suffix = "[ARMED]" if armed else "[DISARMED]"
        if s and s.state == "armed":
            suffix += "  [LOCKED — session armed]"
        return MenuState(title=f"{title}  {suffix}", items=items)

    def _program_menu(self) -> MenuState:
        s = self.session
        armed_lock = bool(s and s.state == "armed")
        items: list[MenuItem] = []
        if not armed_lock:
            items.append(MenuItem("Apply Preset",
                                  action=lambda: self._push_menu(self._preset_menu())))
            items.append(MenuItem("Paradigm Settings",
                                  action=lambda: self._push_menu(self._paradigm_settings_menu())))
            if s and s.paradigm == "pavlovian":
                items.append(MenuItem("Pavlovian Settings",
                                      action=lambda: self._push_menu(self._pavlovian_menu())))
            items.append(MenuItem("Limits", action=lambda: self._push_menu(self._limits_menu())))

        if s and s.state == "running":
            items.append(MenuItem("Stop Session", action=self._stop_program))
            items.append(MenuItem("Pause Session", action=self._pause_program))
            items.append(MenuItem("Split Segment", action=self._split_segment))
            items.append(MenuItem("Restart Program", action=self._restart_program))
        elif s and s.state == "paused":
            items.append(MenuItem("Stop Session", action=self._stop_program))
            items.append(MenuItem("Play (Resume)", action=self._pause_program))
            items.append(MenuItem("Split Segment", action=self._split_segment))
            items.append(MenuItem("Restart Program", action=self._restart_program))
        elif s and s.state == "armed":
            items.append(MenuItem("Start Now (skip trigger)", action=self._start_program))
            items.append(MenuItem("Cancel Arm", action=self._disarm_external_trigger))
        else:
            items.append(MenuItem("Start Session", action=self._start_program))
            if s and s.has_external_trigger:
                items.append(MenuItem("Start on External Trigger",
                                      action=self._arm_external_trigger))

        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program", items=items)

    def _preset_menu(self) -> MenuState:
        s = self.session
        items: list[MenuItem] = []
        presets = P.presets_for(s.paradigm) if s else []
        for preset in presets:
            items.append(MenuItem(
                preset["name"],
                action=lambda pid=preset["id"]: self._apply_preset(pid),
            ))
        if not presets:
            hint = ("Upload firmware or attach a session first" if not (s and s.paradigm)
                    else f"No built-in presets for {s.paradigm}")
            items.append(MenuItem(f"──── {hint} ────", is_separator=True))
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Apply Preset", items=items)

    def _paradigm_settings_menu(self) -> MenuState:
        # Mirror web/src/components/program/ParadigmSettings.tsx: show only the
        # fields relevant to the active paradigm, with live value suffixes.
        s = self.session
        # Base name: fr_lite/pr_lite/... take the same settings as fr/pr/...
        paradigm = P.base_paradigm(s.paradigm) if s else None
        ps = s.paradigm_settings if s else {}

        items: list[MenuItem] = []
        if paradigm in ("fr", "pr"):
            items.append(MenuItem("Set Ratio", action=lambda: self._prompt_int_input(
                "Enter ratio:", lambda v: self._send_paradigm_setting("ratio", v)
            ), suffix=f"({ps.get('ratio', 1)})"))
        if paradigm == "pr":
            items.append(MenuItem("Set PR Step", action=lambda: self._prompt_int_input(
                "Enter PR step:", lambda v: self._send_paradigm_setting("step", v)
            ), suffix=f"({ps.get('step', 1)})"))
        if paradigm == "vi":
            items.append(MenuItem("Set VI Interval (ms)", action=lambda: self._prompt_int_input(
                "Enter VI interval (ms):", lambda v: self._send_paradigm_setting("vi_interval", v)
            ), suffix=f"({ps.get('interval', 30000)})"))
        if paradigm == "omission":
            items.append(MenuItem("Set Omission Interval (ms)", action=lambda: self._prompt_int_input(
                "Enter omission interval (ms):", lambda v: self._send_paradigm_setting("om_interval", v)
            ), suffix=f"({ps.get('interval', 30000)})"))
        if not items:
            hint = "Pavlovian: use Pavlovian Settings" if paradigm == "pavlovian" else "No paradigm selected"
            items.append(MenuItem(f"──── {hint} ────", is_separator=True))

        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Paradigm Settings", items=items)

    def _pavlovian_menu(self) -> MenuState:
        s = self.session
        tracked = s.pavlovian_params if s else {}
        items = []
        # The param *list* is sourced dynamically from reacher's registry
        # (paradigm-filtered + deprecation-stripped server-side), so re-enabled
        # params surface automatically. Rendered in three blocks mirroring
        # PavlovianSettings.tsx: scalar (206-219 sans ITI), ITI (cross-validated),
        # and pulse config. Each path records the value so the suffix reflects the
        # last value set this session.
        specs = s.pav_commands if s else []

        def _label(code: int, spec: dict) -> str:
            return PAV_LABEL_OVERRIDES.get(code) or spec.get("description") or f"Code {code}"

        def _suffix(code: int) -> str:
            return f"({tracked[code]})" if code in tracked else ""

        scalar = sorted(
            (sp for sp in specs if sp.get("payload_key") and 206 <= sp.get("code", 0) <= 219),
            key=lambda sp: sp["code"],
        )
        for sp in scalar:
            code = sp["code"]
            label = _label(code, sp)
            if code in ITI_CODES:
                # Cross-validated against the other ITI values (Min <= Mean <= Max).
                action = lambda c=code, lbl=label: self._prompt_int_input(
                    f"Enter {lbl}:", lambda v, c2=c: self._send_pavlovian_iti(c2, v)
                )
            elif sp.get("payload_type") == "bool":
                action = lambda c=code, lbl=label: self._prompt_select(
                    f"{lbl}:",
                    [("Off", "0"), ("On", "1")],
                    lambda v, c2=c: self._set_pavlovian_param(c2, int(v)),
                )
            else:
                action = lambda c=code, lbl=label: self._prompt_int_input(
                    f"Enter {lbl}:", lambda v, c2=c: self._set_pavlovian_param(c2, v)
                )
            items.append(MenuItem(f"Set {label}", action=action, suffix=_suffix(code)))

        # Pulse-configuration block (0 = continuous tone), also registry-sourced.
        pulse = sorted(
            (sp for sp in specs if sp.get("code") in PULSE_CODES),
            key=lambda sp: sp["code"],
        )
        for sp in pulse:
            code = sp["code"]
            label = _label(code, sp)
            items.append(MenuItem(
                f"Set {label}",
                action=lambda c=code, lbl=label: self._prompt_int_input(
                    f"Enter {lbl}:", lambda v, c2=c: self._set_pavlovian_param(c2, v)
                ),
                suffix=_suffix(code),
            ))

        if not scalar and not pulse:
            items.append(MenuItem("Reload commands", action=self._load_commands))
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Pavlovian Settings", items=items)

    def _limits_menu(self) -> MenuState:
        s = self.session
        current_type = s.limit_settings["type"] if s else "Time"
        limit_types = LIMIT_TYPES_PAVLOVIAN if (s and s.paradigm == "pavlovian") else LIMIT_TYPES_OPERANT
        items = [
            MenuItem("Set Limit Type", action=lambda: self._prompt_select(
                "Select Limit Type",
                [(t, t) for t in limit_types],
                self._set_limit_type,
            ), suffix=f"({current_type})"),
            MenuItem("Set Time Limit (s)", action=lambda: self._prompt_int_input(
                "Enter time limit (seconds):",
                lambda v: self._set_limit_value("time_limit", v)
            ), suffix=f"({s.limit_settings['time_limit']})" if s else ""),
            MenuItem("Set Infusion Limit", action=lambda: self._prompt_int_input(
                "Enter infusion limit:",
                lambda v: self._set_limit_value("infusion_limit", v)
            ), suffix=f"({s.limit_settings['infusion_limit']})" if s else ""),
            MenuItem("Set Delay (s)", action=lambda: self._prompt_int_input(
                "Enter delay (seconds):",
                lambda v: self._set_limit_value("delay", v)
            ), suffix=f"({s.limit_settings['delay']})" if s else ""),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Program > Limits", items=items)

    def _monitor_menu(self) -> MenuState:
        items = [
            MenuItem("View Status", action=self._view_status),
            MenuItem("Live Stream", action=self._enter_monitor),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Monitor", items=items)

    def _data_menu(self) -> MenuState:
        s = self.session
        where = "on the Pi" if self.api.is_remote else "on this machine"
        local_dir = s.file_config.get("local_dir") if s else None
        items = [
            MenuItem("Set Filename", action=lambda: self._prompt_input(
                "Enter filename:", self._set_filename),
                suffix=f"({s.file_config.get('filename') or '-'})" if s else ""),
            MenuItem(f"Set Destination ({where})", action=lambda: self._prompt_input(
                f"Enter destination path {where}:", self._set_destination),
                suffix=f"({s.file_config.get('destination') or '~/Downloads'})" if s else ""),
            MenuItem("Set Notes", action=lambda: self._prompt_input(
                "Enter notes:", self._set_notes)),
            MenuItem("Export ZIP", action=self._export_zip,
                     suffix=f"({os.path.basename(s.last_export)})" if s and s.last_export else ""),
        ]
        if self.api.is_remote:
            items.append(MenuItem("Download Last Export to This Machine", action=self._download_last_export,
                                  suffix="[done]" if s and s.last_download else ""))
            items.append(MenuItem("Set Local Download Folder", action=lambda: self._prompt_input(
                "Enter local folder for downloaded exports:", self._set_local_dir),
                suffix=f"({local_dir})" if local_dir else ""))
        items += [
            MenuItem("View Data Preview", action=self._view_data_preview),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Data", items=items)

    def _machines_menu(self) -> MenuState:
        remote = self.api.device_id
        items: list[MenuItem] = [MenuItem("──── Control target ────", is_separator=True)]
        items.append(MenuItem("This machine (local)", action=lambda: self._select_target(None, "this machine"),
                              suffix="[current]" if remote is None else ""))
        paired = [m for m in self.machines if m.get("paired")]
        unpaired = [m for m in self.machines if not m.get("paired")]
        for m in paired:
            tag = "[current]" if m["device_id"] == remote else ("" if m.get("discovered") else "[not seen]")
            items.append(MenuItem(
                f"{m.get('name') or m['hostname']}  {m.get('url', '')}",
                action=lambda mm=m: self._select_target(mm["device_id"], mm.get("name") or mm["hostname"]),
                suffix=tag,
            ))
        if unpaired:
            items.append(MenuItem("──── Discovered, not paired ────", is_separator=True))
            for m in unpaired:
                items.append(MenuItem(
                    f"Pair {m['hostname']}  {m.get('url', '')}",
                    action=lambda mm=m: self._prompt_input(
                        f"Pairing code shown on {mm['hostname']}:",
                        lambda code, d=mm["device_id"]: self._pair(self.api.pair_device(d, _digits(code)))),
                ))
        items += [
            MenuItem("──── Pairing ────", is_separator=True),
            MenuItem("Pair by Code (any discovered device)", action=lambda: self._prompt_input(
                "Pairing code shown on the device:",
                lambda code: self._pair(self.api.pair_by_code(_digits(code))))),
            MenuItem("Pair by URL + Code", action=lambda: self._prompt_input(
                "Device URL (e.g. http://192.168.1.50:6229):", self._pair_by_url_step)),
            MenuItem("Add Manually (URL + API key)", action=lambda: self._prompt_input(
                "Device URL (e.g. http://192.168.1.50:6229):", self._pair_manual_step)),
        ]
        if paired:
            items.append(MenuItem("Unpair a Machine", action=lambda: self._prompt_select(
                "Unpair which machine?",
                [(m.get("name") or m["hostname"], m["device_id"]) for m in paired],
                self._unpair)))
        items += [
            MenuItem("Refresh", action=self._open_machines_menu),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Machines", items=items)

    # ───────────────────────────────────────────────────────────────────
    # Menu navigation
    # ───────────────────────────────────────────────────────────────────

    def _push_menu(self, menu: MenuState) -> None:
        menu.parent = self.menu
        self.menu = menu
        self._invalidate()

    def _pop_menu(self) -> None:
        if self.menu.parent:
            self.menu = self.menu.parent
            # Rebuild to reflect updated state
            self._rebuild_current_menu()
        self._invalidate()

    def _rebuild_current_menu(self) -> None:
        """Rebuild the current menu to reflect live state changes."""
        # Titles may carry a state suffix ("Hardware  [LOCKED — armed]").
        title = self.menu.title.split("  [")[0]
        parent = self.menu.parent
        selected = self.menu.selected

        builders = {
            "Main Menu": self._main_menu,
            "Machines": self._machines_menu,
            "Session": self._session_menu,
            "Hardware": self._hardware_menu,
            "Program": self._program_menu,
            "Program > Apply Preset": self._preset_menu,
            "Program > Paradigm Settings": self._paradigm_settings_menu,
            "Program > Pavlovian Settings": self._pavlovian_menu,
            "Program > Limits": self._limits_menu,
            "Monitor": self._monitor_menu,
            "Data": self._data_menu,
        }
        if title.startswith("Hardware > "):
            label = title[len("Hardware > "):]
            dev = next((d for d in DEVICE_CONFIGS if d["label"] == label), None)
            if dev:
                builders[title] = lambda d=dev["id"]: self._device_menu(d)

        builder = builders.get(title)
        if builder:
            new_menu = builder()
            new_menu.parent = parent
            new_menu.selected = min(selected, len(new_menu.items) - 1)
            self.menu = new_menu

    # ───────────────────────────────────────────────────────────────────
    # Input / Select prompts
    # ───────────────────────────────────────────────────────────────────

    def _prompt_input(self, prompt: str, callback: Callable, mask: bool = False) -> None:
        self.mode = "input"
        self.input_prompt = prompt
        self.input_value = ""
        self.input_callback = callback
        self.input_mask = mask
        self._invalidate()

    def _prompt_int_input(self, prompt: str, callback: Callable) -> None:
        """Like _prompt_input, but validates that the value is an integer."""
        def _validate(val: str):
            n = _safe_int(val, prompt)
            if n is None:
                self._set_status(f"Invalid number: {val!r}", error=True)
                return
            callback(n)
        self._prompt_input(prompt, _validate)

    def _prompt_select(self, title: str, options: list[tuple[str, str]], callback: Callable) -> None:
        self.mode = "select"
        self.select_title = title
        self.select_options = options
        self.select_index = 0
        self.select_callback = callback
        self._invalidate()

    def _submit_input(self) -> None:
        value = self.input_value.strip()
        cb = self.input_callback
        self.mode = "menu"
        self.input_callback = None
        self._invalidate()
        if cb and value:
            self._run_action(lambda: cb(value))

    def _submit_select(self) -> None:
        if not self.select_options:
            self.mode = "menu"
            return
        _label, value = self.select_options[self.select_index]
        cb = self.select_callback
        self.mode = "menu"
        self.select_callback = None
        self._invalidate()
        if cb:
            self._run_action(lambda: cb(value))

    def _cancel_input(self) -> None:
        self.mode = "menu"
        self.input_callback = None
        self.select_callback = None
        self._invalidate()

    # ───────────────────────────────────────────────────────────────────
    # Async action runner
    # ───────────────────────────────────────────────────────────────────

    def _run_action(self, coro_fn: Callable) -> None:
        async def _wrapper():
            try:
                result = coro_fn()
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:
                self._set_status(f"Error: {exc}", error=True)
        if self.app:
            self.app.create_background_task(_wrapper())

    # ───────────────────────────────────────────────────────────────────
    # Session actions
    # ───────────────────────────────────────────────────────────────────

    async def _create_session(self) -> None:
        try:
            ports_resp = await self.api.list_ports()
            ports = ports_resp.get("ports", [])
        except Exception:
            ports = []

        if not ports:
            self._set_status("No serial ports found", error=True)
            return

        self._prompt_select(
            "Select Serial Port",
            [(p, p) for p in ports],
            self._on_port_selected,
        )

    async def _on_port_selected(self, port: str) -> None:
        # Optionally select paradigm
        try:
            paradigms_resp = await self.api.list_paradigms()
            paradigms = paradigms_resp.get("paradigms", [])
        except Exception:
            paradigms = []

        if paradigms:
            self._prompt_select(
                "Select Paradigm (optional — Esc to skip)",
                [(p, p) for p in paradigms],
                lambda p: self._finish_create_session(port, p),
            )
        else:
            await self._finish_create_session(port, None)

    async def _finish_create_session(self, port: str, paradigm: str | None) -> None:
        try:
            resp = await self.api.create_session(port, paradigm)
            sid = resp.get("session_id") or resp.get("id", "")
            self._stop_ws()
            self.monitor_lines.clear()
            self.session = SessionState(id=sid, port=port, paradigm=paradigm)
            self._ensure_ws()
            self._set_status(f"Session created on {self.target_name}: {sid[:8]}...")
            await self._load_commands()
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Create session failed: {exc}", error=True)

    async def _connect(self) -> None:
        if not self.session:
            self._set_status("No session — create one first", error=True)
            return
        try:
            await self.api.connect_serial(self.session.id)
            self.session.state = "connected"
            self._set_status("Serial connected")
            await self._hydrate_config()
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Connect failed: {exc}", error=True)

    async def _disconnect(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        was_armed = self.session.state == "armed"
        try:
            await self.api.disconnect_serial(self.session.id)
            self.session.state = "idle"
            self._set_status(
                "Serial disconnected — the pending external start was cancelled"
                if was_armed else "Serial disconnected"
            )
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Disconnect failed: {exc}", error=True)

    async def _upload_firmware(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Select Board",
            [("Arduino Uno", "uno"), ("Arduino Mega", "mega")],
            self._on_board_selected,
        )

    async def _on_board_selected(self, board: str) -> None:
        try:
            paradigms_resp = await self.api.list_paradigms(board)
            paradigms = paradigms_resp.get("paradigms", [])
        except Exception:
            paradigms = ["fr", "pr", "vi", "omission", "pavlovian"]

        self._prompt_select(
            "Select Paradigm",
            [(p, p) for p in paradigms],
            lambda p: self._finish_upload(board, p),
        )

    def _read_local_hex(self, paradigm: str, board: str) -> str | None:
        """Read a local hex file and return base64-encoded content, or None."""
        import base64

        try:
            from reacher.uploader import FirmwareUploader

            uploader = FirmwareUploader()
            path = uploader.get_hex_path(paradigm, board)
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode("ascii")
        except Exception:
            return None

    async def _finish_upload(self, board: str, paradigm: str) -> None:
        if not self.session:
            return
        try:
            self._set_status("Uploading firmware...")
            self.session.state = "uploading"
            hex_data = self._read_local_hex(paradigm, board)
            await self.api.upload_firmware(self.session.id, paradigm, board, hex_data=hex_data)
            self.session.paradigm = paradigm
            self.session.board = board
            self.session.state = "connected"
            # A reflashed board starts from its own defaults; forget what the
            # previous firmware had and re-read it from the config dump.
            self.session.hw = P.default_hardware()
            self.session.pavlovian_params = {}
            self._set_status(f"Firmware uploaded: {paradigm} ({board})")
            if not self.session.name:
                self.session.name = f"{paradigm.upper()} {self.session.port}"
            # Unconditional: the upload just changed which commands the board
            # accepts, so the capability flags must be re-sniffed.
            await self._load_commands()
            await self._hydrate_config()
            self._rebuild_current_menu()
        except Exception as exc:
            self.session.state = "idle"
            self._set_status(f"Upload failed: {exc}", error=True)

    async def _load_commands(self) -> None:
        """Fetch the registry-driven command set the running firmware accepts.

        Feeds both the Pavlovian settings menu and the optional-hardware
        capability flags.
        """
        if not self.session:
            return
        try:
            resp = await self.api.get_commands(self.session.id)
            commands = resp.get("commands", [])
            self.session.pav_commands = commands
            self.session.has_external_trigger = any(
                c.get("code") == 1201 for c in commands
            )
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Failed to load commands: {exc}", error=True)

    async def _reset_session(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        was_armed = self.session.state == "armed"
        try:
            await self.api.reset_session(self.session.id)
            s = self.session
            s.state = "idle"
            s.hw = P.default_hardware()
            self._reset_counters()
            s.program_start = None
            s.program_end = None
            s.last_export = s.last_download = None
            self._set_status(
                "Session reset — the pending external start was cancelled"
                if was_armed else "Session reset"
            )
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Reset failed: {exc}", error=True)

    def _reset_counters(self) -> None:
        s = self.session
        if not s:
            return
        s.infusion_count = s.press_count = s.trial_count = 0
        s.cs_plus_count = s.cs_minus_count = s.frame_count = 0
        s.backend_event_count = 0
        s.rh_counts = {"active": 0, "timeout": 0, "inactive": 0}
        s.lh_counts = {"active": 0, "timeout": 0, "inactive": 0}

    async def _destroy_session(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        prompt = "Destroy session? This cannot be undone."
        if self.session.state == "armed":
            prompt = ("Session is armed and waiting for an external trigger. "
                      "Destroying disarms the board and cancels the pending start. Continue?")
        self._prompt_select(
            prompt,
            [("Yes", "yes"), ("No", "no")],
            self._confirm_destroy,
        )

    async def _confirm_destroy(self, choice: str) -> None:
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            await self.api.destroy_session(self.session.id)
            self._stop_ws()
            self.session = None
            self._set_status("Session destroyed")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Destroy failed: {exc}", error=True)

    async def _detach(self) -> None:
        """Forget the session locally; it keeps running on the host."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        sid = self.session.id
        self._stop_ws()
        self.session = None
        # The host's orphan cleanup destroys a session with no connected client
        # (about 60 s idle, 10 min running), so re-attach before then.
        self._set_status(f"Detached from {sid[:8]} — re-attach soon: the host ends client-less sessions")
        self._rebuild_current_menu()

    async def _choose_attach(self) -> None:
        try:
            sessions = (await self.api.list_sessions()).get("sessions", [])
        except Exception as exc:
            self._set_status(f"List sessions failed: {exc}", error=True)
            return
        if not sessions:
            self._set_status(f"No sessions on {self.target_name}")
            return
        opts = [(f"{x['session_id'][:8]}  {x.get('paradigm') or '-':<10} {x.get('port', '')}  [{x.get('state')}]",
                 x["session_id"]) for x in sessions]
        self._prompt_select(f"Attach to a session on {self.target_name}", opts, self._attach)

    async def _attach(self, sid: str) -> None:
        """Rebuild local state for a session this process did not create."""
        try:
            info = await self.api.get_session(sid)
        except Exception as exc:
            self._set_status(f"Attach failed: {exc}", error=True)
            return
        self._stop_ws()
        self.monitor_lines.clear()
        s = SessionState(id=sid, port=info.get("port", ""), paradigm=info.get("paradigm"),
                         board=info.get("board"), state=info.get("state", "idle"))
        s.firmware_info = info.get("firmware_info")
        s.attached = True
        if s.paradigm:
            s.name = f"{s.paradigm.upper()} {s.port}"
        self.session = s
        await self._load_commands()
        await self._hydrate_config()
        # Replay what the host already recorded so counters are correct, then
        # follow live from that point (the WS reconnect path uses ``since``).
        try:
            resp = await self.api.get_behavior(sid)
            for entry in resp.get("data", []):
                self._handle_ws_message({"type": "event", "data": entry}, replay=True)
            s.backend_event_count = resp.get("total", s.backend_event_count)
        except Exception as exc:
            self._set_status(f"Attached, but event history failed: {exc}", error=True)
        self._ensure_ws()
        self._set_status(f"Attached to {sid[:8]} on {self.target_name} [{s.state}] — "
                         f"{s.backend_event_count} events so far")
        self._rebuild_current_menu()

    async def _hydrate_config(self) -> None:
        """Seed device state from the host's last firmware config dump."""
        s = self.session
        if not s:
            return
        try:
            cfg = await self.api.get_config(s.id)
        except Exception:
            return
        for row in cfg.get("hardware_settings", []) or []:
            P.merge_firmware_row(s.hw, row)
            P.merge_controller_row(s.paradigm_settings, row)
        if cfg.get("firmware_info"):
            s.firmware_info = cfg["firmware_info"]

    async def _show_session_info(self) -> None:
        s = self.session
        if not s:
            self._set_status("No active session")
            return
        info = (f"ID: {s.id}  |  Port: {s.port}  |  State: {s.state}  |  "
                f"Paradigm: {s.paradigm or 'none'}  |  Board: {s.board or 'none'}")
        self._set_status(info)

    # ───────────────────────────────────────────────────────────────────
    # Hardware actions
    # ───────────────────────────────────────────────────────────────────

    async def _send_hw_command(self, code: int, value: int | None = None) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        # The backend 409s device commands while armed, because config is applied
        # one command per request and a trigger edge landing mid-edit would start
        # the run on a half-applied config. Refuse locally so the operator gets
        # the reason rather than a raw request failure. Mirrors the web app's
        # ConfigLock.
        if self.session.state == "armed":
            self._set_status(
                "Armed and waiting for the external trigger — cancel the arm to change settings",
                error=True,
            )
            return
        try:
            await self.api.send_command(self.session.id, code, value)
            # Record locally so the start-time re-send carries this setting.
            P.record_command(self.session.hw, self.session.paradigm_settings, code, value)
            for cfg in DEVICE_CONFIGS:
                if code == cfg["arm"]:
                    self._set_status(f"{cfg['label']} armed")
                    break
                elif code == cfg["disarm"]:
                    self._set_status(f"{cfg['label']} disarmed")
                    break
            else:
                if value is not None:
                    self._set_status(f"Command {code} sent with value {value}")
                else:
                    self._set_status(f"Command {code} sent")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Command failed: {exc}", error=True)

    async def _send_laser_mode(self, code: int) -> None:
        # Pavlovian trial-paired modes need contingent (681) first, as in
        # ConfigurationPanel.tsx.
        if code in (691, 692, 693):
            await self._send_hw_command(681)
        await self._send_hw_command(code)

    async def _send_commands(self, cmds: list[tuple[int, int | None]]) -> list[int]:
        """Send a batch, skipping codes the firmware does not declare. Returns skipped codes."""
        kept, dropped = P.filter_allowed(cmds, self.session.allowed_codes)
        for code, value in kept:
            await self.api.send_command(self.session.id, code, value)
        return dropped

    async def _test_chain(self) -> None:
        await self._send_hw_command(SYSTEM_COMMANDS["test_chain"])

    async def _toggle_test_mode(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.test_mode = not self.session.test_mode
        await self._send_hw_command(SYSTEM_COMMANDS["test_mode"])
        self._rebuild_current_menu()

    # ───────────────────────────────────────────────────────────────────
    # Program actions
    # ───────────────────────────────────────────────────────────────────

    async def _apply_preset(self, preset_id: str) -> None:
        """ConfigurationPanel.applySessionPreset, using the shared definitions."""
        s = self.session
        if not s:
            self._set_status("No session", error=True)
            return
        if s.state == "armed":
            self._set_status("Armed — cancel the arm to change settings", error=True)
            return
        preset = P.PRESET_BY_ID[preset_id]
        self._set_status(f"Applying preset: {preset['name']}...")
        try:
            merged = P.merge_preset_hardware(s.hw, preset)
            s.hw = merged
            dropped: list[int] = []
            # Commands only go out pre-start; otherwise the state is staged and
            # sent by the start-time re-send, exactly like the web.
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
        except Exception as exc:
            self._set_status(f"Preset failed: {exc}", error=True)

    async def _send_paradigm_setting(self, key: str, value: int) -> None:
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
                f"Invalid ITI: need Min <= Mean <= Max "
                f"(Min={iti_min}, Mean={mean}, Max={iti_max})",
                error=True,
            )
            return
        await self._send_hw_command(code, value)
        self.session.pavlovian_params[code] = value
        self._rebuild_current_menu()

    async def _prepare_run(self) -> bool:
        """SessionStartModal.handleStart: limits, then the full config re-send.

        Re-sending everything (rather than trusting what the board holds) is
        what keeps a reconnect, a replayed pump target, or an earlier session
        on the same board from leaking into this run. Includes 221 (reward
        pump target) for operant paradigms.
        """
        s = self.session
        try:
            await self._send_limits()
            await self._send_commands(P.start_commands(
                s.paradigm, s.hw, s.paradigm_settings, s.pavlovian_params))
            return True
        except Exception as exc:
            self._set_status(f"Start aborted — config not applied: {exc}", error=True)
            return False

    async def _start_program(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            # Armed: config is frozen (backend 409s it), so start as-is.
            if self.session.state != "armed" and not await self._prepare_run():
                return
            await self.api.start_program(self.session.id)
            self.session.state = "running"
            self.session.program_start = time.time()
            self.session.program_end = None
            self.session.last_export = self.session.last_download = None
            self._set_status("Session started")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Start failed: {exc}", error=True)

    async def _arm_external_trigger(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            if not await self._prepare_run():
                return
            await self.api.arm_external_trigger(self.session.id)
            # program_start is deliberately left unset — t0 is the trigger edge,
            # which the backend reports via session_state, not this call.
            self.session.state = "armed"
            self.session.last_export = self.session.last_download = None
            self._set_status("Armed — waiting for external trigger")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Arm failed: {exc}", error=True)

    async def _disarm_external_trigger(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.disarm_external_trigger(self.session.id)
            self.session.state = "connected"
            self._set_status("Trigger disarmed")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Disarm failed: {exc}", error=True)

    async def _stop_program(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Stop session?",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_stop,
        )

    async def _confirm_stop(self, choice: str) -> None:
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            await self.api.stop_program(self.session.id)
            self.session.state = "stopped"
            self.session.program_end = time.time()
            self._set_status("Session stopped")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Stop failed: {exc}", error=True)

    async def _pause_program(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.pause_program(self.session.id)
            if self.session.state == "paused":
                # Resume
                if self.session.pause_start:
                    self.session.paused_time += time.time() - self.session.pause_start
                    self.session.pause_start = None
                self.session.state = "running"
                self._set_status("Session resumed")
            else:
                self.session.state = "paused"
                self.session.pause_start = time.time()
                self._set_status("Session paused")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Pause/resume failed: {exc}", error=True)

    async def _split_segment(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            result = await self.api.split_segment(self.session.id)
            seg = result.get("segment_number", "?")
            self._set_status(f"Segment split — now on segment {int(seg) + 1}")
        except Exception as exc:
            self._set_status(f"Split failed: {exc}", error=True)

    async def _restart_program(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Restart program? (Arduino will stop and re-start)",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_restart,
        )

    async def _confirm_restart(self, choice: str) -> None:
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            await self.api.restart_program(self.session.id)
            self.session.state = "running"
            self.session.program_start = time.time()
            self.session.program_end = None
            self.session.paused_time = 0
            self.session.pause_start = None
            self._set_status("Program restarted")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Restart failed: {exc}", error=True)

    async def _send_limits(self) -> None:
        lim = self.session.limit_settings
        body = P.limit_payload({"limitType": lim["type"], "timeLimit": lim["time_limit"],
                                "infusionLimit": lim["infusion_limit"], "delay": lim["delay"]})
        limit_type = body.pop("type")
        await self.api.set_limit(self.session.id, limit_type, **body)

    async def _set_limit_type(self, limit_type: str) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings["type"] = limit_type
        try:
            await self._send_limits()
            self._set_status(f"Limit type set to {limit_type}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    async def _set_limit_value(self, key: str, value: int) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings[key] = value
        try:
            await self._send_limits()
            self._set_status(f"{key} set to {value}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    # ───────────────────────────────────────────────────────────────────
    # Monitor actions
    # ───────────────────────────────────────────────────────────────────

    async def _view_status(self) -> None:
        if not self.session:
            self._set_status("No session")
            return
        s = self.session
        self._set_status(
            f"Elapsed: {s.elapsed_str}  |  Infusions: {s.infusion_count}  |  "
            f"Presses: {s.press_count}  |  State: {s.state}"
        )

    async def _enter_monitor(self) -> None:
        if not self.session:
            self._set_status("No session — create one first", error=True)
            return
        self.mode = "monitor"
        self._ensure_ws()
        self._invalidate()

    async def _exit_monitor(self) -> None:
        # The socket deliberately stays open: it is what keeps counters, state
        # and the host's idle watchdog current while the operator is in menus.
        self.mode = "menu"
        self._rebuild_current_menu()
        self._invalidate()

    def _ensure_ws(self) -> None:
        """Start the session's background WebSocket if it is not running."""
        if not self.session or (self._ws_task and not self._ws_task.done()):
            return
        self._ws_task = asyncio.ensure_future(self._stream_events(self.session.id))

    def _stop_ws(self) -> None:
        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()
        self._ws_task = None
        self.ws_connected = False

    def _log(self, text: str, error: bool = False) -> None:
        self.monitor_lines.append(("class:status-bar-error" if error else "class:monitor-event", text))
        del self.monitor_lines[:-500]

    async def _stream_events(self, sid: str) -> None:
        try:
            import websockets
        except ImportError:
            self._log("websockets not installed — cannot stream", error=True)
            self._invalidate()
            return

        # Local: /ws/{sid}?token=<key>. Remote: the local backend's relay,
        # /api/proxy/{device}/ws/{sid}?token=<LOCAL key>. The backend rejects
        # a socket without the token (403 before any session lookup).
        connected_once = False
        attempt = 0

        async def _refresh_loop():
            while True:
                await asyncio.sleep(1)
                self._invalidate()

        refresh = asyncio.ensure_future(_refresh_loop())
        try:
            # Retries forever with capped backoff: for a walk-away run the
            # live link must come back on its own after a Wi-Fi blip or a
            # controller sleep, rather than give up after a fixed count.
            while self.session and self.session.id == sid:
                try:
                    async with websockets.connect(self.api.ws_url(sid), open_timeout=15) as ws:
                        attempt = 0
                        self.ws_connected = True
                        if connected_once:
                            await self._recover_missed_events()
                            self._log("  [info] Live link restored")
                        connected_once = True
                        self._invalidate()
                        async for raw in ws:
                            try:
                                msg = json.loads(raw)
                            except json.JSONDecodeError:
                                continue
                            # A handler bug must not tear down the socket.
                            try:
                                self._handle_ws_message(msg)
                            except Exception as exc:
                                self._log(f"Bad {msg.get('type', '?')} message: {exc}", error=True)
                            self._invalidate()
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self.ws_connected = False
                    attempt += 1
                    delay = min(2 ** min(attempt - 1, 4), 15)
                    if attempt in (1, 5) or attempt % 20 == 0:
                        self._log(f"Live link down ({type(exc).__name__}: {exc}); retrying every {delay}s",
                                  error=True)
                    self._invalidate()
                    await asyncio.sleep(delay)
                    # A session the host destroyed (orphan cleanup, another
                    # client) will never accept a socket again: stop retrying.
                    if attempt % 5 == 0 and not await self._session_still_exists(sid):
                        self._log(f"Session {sid[:8]} no longer exists on {self.target_name}", error=True)
                        if self.session and self.session.id == sid:
                            self.session.state = "gone"
                        return
                else:
                    self.ws_connected = False
        except asyncio.CancelledError:
            pass
        finally:
            refresh.cancel()
            self.ws_connected = False

    async def _session_still_exists(self, sid: str) -> bool:
        try:
            sessions = (await self.api.list_sessions()).get("sessions", [])
            return any(x.get("session_id") == sid for x in sessions)
        except Exception:
            return True  # can't tell (host unreachable) — keep trying

    async def _recover_missed_events(self) -> None:
        """Fetch events missed during a WebSocket gap, and the current state."""
        if not self.session:
            return
        try:
            info = await self.api.get_session(self.session.id)
            if info.get("state"):
                self._handle_ws_message({"type": "session_state", "data": {"state": info["state"]}})
        except Exception:
            pass
        try:
            since = self.session.backend_event_count
            resp = await self.api.get_behavior(self.session.id, since=since)
            data = resp.get("data", [])
            total = resp.get("total", 0)
            if total < since:
                # Buffers were reset (restart/new run): replay from zero.
                self._reset_counters()
                resp = await self.api.get_behavior(self.session.id)
                data, total = resp.get("data", []), resp.get("total", 0)
            for entry in data:
                self._handle_ws_message({"type": "event", "data": entry}, replay=True)
            self.session.backend_event_count = total
            if data:
                self._log(f"  [info] Recovered {len(data)} missed events")
        except Exception as exc:
            self._log(f"Event recovery failed: {exc}", error=True)

    def _handle_ws_message(self, msg: dict, replay: bool = False) -> None:
        """Route one message. Mirrors handleMessage in web/src/hooks/useSessionWebSockets.ts.

        ``replay`` is set for events fetched over REST (attach / gap recovery):
        they update counters but must not re-trigger side effects.
        """
        msg_type = msg.get("type", "")
        data = msg.get("data", msg)
        s = self.session
        if s and msg.get("session_id") not in (None, s.id):
            return

        if msg_type == "event":
            device = str(data.get("device", ""))
            event = str(data.get("event", ""))
            ts = data.get("start_timestamp", data.get("timestamp", ""))
            if isinstance(ts, (int, float)):
                ts = f"{ts / 1000:9.1f}s"
            extra = f" ({data['trial_type']})" if data.get("trial_type") else ""
            if not replay:
                self._log(f"[{ts}]  {device:<16} {event}{extra}")
            if s:
                if not replay:
                    s.backend_event_count += 1
                dev = device.upper()
                evt = event.upper()
                if dev in ("PUMP", "PUMP_1") and evt == "INFUSION":
                    s.infusion_count += 1
                elif dev in ("RH_LEVER", "LEVER_RH", "LH_LEVER", "LEVER_LH") and "PRESS" in evt:
                    s.press_count += 1
                    counts = s.rh_counts if dev in ("RH_LEVER", "LEVER_RH") else s.lh_counts
                    for name in ("active", "timeout", "inactive"):
                        if evt == f"{name.upper()}_PRESS":
                            counts[name] = counts.get(name, 0) + 1
                elif dev == "PAVLOV" and evt == "TRIAL_START":
                    s.trial_count += 1
                    if data.get("trial_type") == "CS_PLUS":
                        s.cs_plus_count += 1
                    elif data.get("trial_type") == "CS_MINUS":
                        s.cs_minus_count += 1
                if dev == "CONTROLLER" and evt == "END" and not replay:
                    s.state = "stopped"
                    s.program_end = time.time()
                    self._auto_export()

        elif msg_type == "frame":
            if s:
                s.frame_count += 1

        elif msg_type == "session_state":
            state = data.get("state", "")
            if s and state:
                prev = s.state
                s.state = state
                if state == "running" and s.program_start is None and not s.attached:
                    s.program_start = time.time()
                elif state == "stopped" and prev != "stopped":
                    s.program_end = time.time()
                if state != prev:
                    self._log(f"  [state] {prev} -> {state}")
                    self._rebuild_current_menu()

        elif msg_type == "config":
            # One record per device: {"device": "LEVER_RH", "armed": true, ...}.
            if s:
                P.merge_firmware_row(s.hw, data)
                P.merge_controller_row(s.paradigm_settings, data)

        elif msg_type == "error":
            self._log(f"  [error] [{data.get('device', '?')}] {data.get('desc', data)}", error=True)

        elif msg_type == "upload_progress":
            self._log(f"  [upload] {data.get('stage', '')} ({data.get('percent', '?')}%)")
            self._set_status(f"Upload: {data.get('stage', '')} ({data.get('percent', '?')}%)")

        elif msg_type == "disconnect":
            if s:
                s.state = "disconnected"
                # The firmware arm mirror cannot refresh over a dead port.
                s.hw.setdefault("externalTrigger", {})["armed"] = False
            reason = data.get("reason", "unknown")
            self._log(f"  [error] Serial disconnected: {reason}", error=True)
            self._set_status(f"Serial disconnected on {self.target_name}: {reason}", error=True)

        elif msg_type in ("export_failed", "kernel_error"):
            label = "Auto-export failed" if msg_type == "export_failed" else "Kernel error"
            self._log(f"  [error] {label}: {data.get('reason', data)}", error=True)
            self._set_status(f"{label}: {data.get('reason', '')}", error=True)

        elif msg_type == "split":
            seg = data.get("segment_number", 0)
            self._log(f"  [split] Segment split — now on segment {int(seg) + 1}")

        elif msg_type == "restart":
            if s:
                s.state = "running"
                s.program_start = time.time()
                s.program_end = None
                s.paused_time = 0
                s.pause_start = None
                s.attached = False
                self._reset_counters()
            self._log("  [restart] Program restarted")

        elif msg_type in ("server_suspended", "session_orphaned"):
            mins = round(int(data.get("hard_kill_in", 0)) / 60)
            what = "Server suspended (idle watchdog)" if msg_type == "server_suspended" else \
                "Session orphaned — the host saw no connected client during the run"
            self._log(f"  [warn] {what}. Host shuts down in ~{mins} min unless a client reconnects.",
                      error=True)
            if s and s.behavior_count_hint():
                self._auto_export()

        elif msg_type == "server_resumed":
            self._log("  [info] Server resumed")

        elif msg_type == "log":
            level = data.get("level", "info")
            text = data.get("message", str(data))
            self._log(f"  [{level}] {text}", error=level in ("error", "critical"))

        elif msg_type != "pong":
            self._log(f"  [?] Unhandled message type: {msg_type}")

    # ───────────────────────────────────────────────────────────────────
    # Data actions
    # ───────────────────────────────────────────────────────────────────

    async def _set_filename(self, value: str) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.file_config["filename"] = value
        try:
            await self.api.set_file_config(self.session.id, filename=value)
            self._set_status(f"Filename set: {value}")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _set_destination(self, value: str) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.file_config["destination"] = value
        try:
            await self.api.set_file_config(self.session.id, destination=value)
            self._set_status(f"Destination set: {value}")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _set_notes(self, value: str) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.file_config["notes"] = value
        try:
            await self.api.set_file_config(self.session.id, notes=value)
            self._set_status("Notes set")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _export_zip(self, auto: bool = False) -> None:
        s = self.session
        if not s:
            self._set_status("No session", error=True)
            return
        if s.exporting:
            return
        s.exporting = True
        try:
            # Mirror triggerAutoExport in web/src/hooks/useSessionWebSockets.ts.
            payload = {
                "session_name": s.name or None,
                "notes": s.file_config.get("notes") or None,
                "infusion_count": s.infusion_count,
                "press_count": s.press_count,
                "trial_count": s.trial_count,
                # The backend expects epoch milliseconds (file.py divides by 1000).
                "program_start_time": s.program_start * 1000 if s.program_start else None,
            }
            resp = await self.api.export_zip(s.id, **{k: v for k, v in payload.items() if v is not None})
            path = resp.get("file_path")
            s.last_export = path
            where = f" on {self.target_name}" if self.api.is_remote else ""
            self._log(f"  [export] Saved{where}: {path}")
            self._set_status(f"{'Auto-e' if auto else 'E'}xported{where}: {path}")
            if path and self.api.is_remote:
                await self._download_last_export()
        except Exception as exc:
            self._log(f"  [error] Export failed: {exc}", error=True)
            self._set_status(f"Export failed: {exc}", error=True)
        finally:
            s.exporting = False
            self._rebuild_current_menu()

    def _auto_export(self) -> None:
        """Export on END like the web does; pulls a copy to this machine when remote."""
        s = self.session
        if not s or s.exporting or s.last_export:
            return
        if self.app:
            self.app.create_background_task(self._export_zip(auto=True))

    async def _download_last_export(self) -> None:
        s = self.session
        if not s or not s.last_export:
            self._set_status("Nothing exported yet — run Export ZIP first", error=True)
            return
        dest = s.file_config.get("local_dir") or os.path.join(
            os.path.expanduser("~/Downloads"), "reacher")
        try:
            local = await self.api.download_export(s.id, s.last_export, dest)
            s.last_download = local
            self._log(f"  [export] Copied to this machine: {local}")
            self._set_status(f"Downloaded: {local}")
        except Exception as exc:
            self._log(f"  [error] Download failed: {exc}", error=True)
            self._set_status(f"Download failed (the ZIP is still on {self.target_name}): {exc}",
                             error=True)
        self._rebuild_current_menu()

    async def _set_local_dir(self, value: str) -> None:
        if self.session:
            self.session.file_config["local_dir"] = os.path.expanduser(value)
            self._set_status(f"Downloads will go to {self.session.file_config['local_dir']}")
            self._rebuild_current_menu()

    async def _view_data_preview(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            resp = await self.api.get_behavior(self.session.id)
            events = resp.get("data", [])
            if not events:
                self._set_status("No data recorded yet")
                return
            lines = []
            for e in events[-8:]:
                ts = e.get("start_timestamp", "")
                ts = f"{ts / 1000:.1f}s" if isinstance(ts, (int, float)) else ts
                lines.append(f"[{ts}] {e.get('device', '')}: {e.get('event', '')}")
            self._set_status(f"{resp.get('total', len(events))} events. Last: " + " | ".join(lines))
        except Exception as exc:
            self._set_status(f"Data fetch failed: {exc}", error=True)

    # ───────────────────────────────────────────────────────────────────
    # Quit
    # ───────────────────────────────────────────────────────────────────

    async def _quit(self) -> None:
        # An armed session warns too: the board starts itself on the next trigger
        # edge, and quitting leaves nothing listening to record it.
        if self.session and self.session.state in ("running", "paused", "armed"):
            prompt = (
                "Session is armed and will start on an external trigger. Quit anyway?"
                if self.session.state == "armed"
                else f"Session is {self.session.state} on {self.target_name}. It keeps running "
                     "after you quit; re-attach within ~10 min or the host ends it. Quit?"
            )
            self._prompt_select(
                prompt,
                [("Yes", "yes"), ("No", "no")],
                self._confirm_quit,
            )
        else:
            await self._do_quit()

    async def _confirm_quit(self, choice: str) -> None:
        if choice == "yes":
            await self._do_quit()
        else:
            self._set_status("Cancelled")

    async def _do_quit(self) -> None:
        self._stop_ws()
        try:
            await self.api.close()
        except Exception:
            pass
        if self.app:
            self.app.exit()

    # ───────────────────────────────────────────────────────────────────
    # Machines (pairing + control target)
    # ───────────────────────────────────────────────────────────────────

    async def _refresh_machines(self) -> None:
        try:
            self.machines = (await self.api.list_machines()).get("devices", [])
        except Exception as exc:
            self.machines = []
            self._set_status(f"Machine list failed: {exc}", error=True)

    async def _open_machines_menu(self) -> None:
        await self._refresh_machines()
        if self.menu.title == "Machines":
            self._rebuild_current_menu()
        else:
            self._push_menu(self._machines_menu())
        self._invalidate()

    async def _select_target(self, device_id: str | None, name: str) -> None:
        if device_id == self.api.device_id:
            return
        if self.session and self.session.state in ("running", "paused", "armed"):
            self._set_status(f"Session {self.session.state} on {self.target_name} — detach first "
                             "(Session > Detach); it keeps running", error=True)
            return
        self._stop_ws()
        self.session = None
        self.monitor_lines.clear()
        self.api.set_target(device_id)
        self.target_name = name
        if device_id:
            try:
                h = await self.api.health()
                self._set_status(f"Now controlling {name} (reacher {h.get('version', '?')}, "
                                 f"{h.get('active_sessions', 0)} active sessions)")
            except Exception as exc:
                self._set_status(f"Selected {name}, but it is not reachable: {exc}", error=True)
        else:
            self._set_status("Now controlling this machine")
        self._rebuild_current_menu()

    async def _pair(self, coro) -> None:
        try:
            m = await coro
            await self._refresh_machines()
            self._set_status(f"Paired {m.get('name') or m.get('hostname')} at {m.get('url')}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Pairing failed: {exc}", error=True)

    async def _pair_by_url_step(self, url: str) -> None:
        self._prompt_input(f"Pairing code shown on {url}:",
                           lambda code: self._pair(self.api.pair_by_url(url, _digits(code))))

    async def _pair_manual_step(self, url: str) -> None:
        # The key is stored server-side in ~/.reacher/machines.json; it is
        # never echoed here (masked input) or kept in this process.
        self._prompt_input(f"API key of {url} (from ~/.reacher/api_key on that machine):",
                           lambda key: self._pair(self.api.pair_manual(url, key.strip())), mask=True)

    async def _unpair(self, device_id: str) -> None:
        if device_id == self.api.device_id:
            await self._select_target(None, "this machine")
        try:
            await self.api.unpair(device_id)
            await self._refresh_machines()
            self._set_status("Machine unpaired")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Unpair failed: {exc}", error=True)

    # ───────────────────────────────────────────────────────────────────
    # Key bindings
    # ───────────────────────────────────────────────────────────────────

    def _build_keybindings(self) -> KeyBindings:
        kb = KeyBindings()

        @kb.add("up")
        def _up(event):
            if self.mode == "menu":
                self.menu.move(-1)
                self._invalidate()
            elif self.mode == "select":
                self.select_index = max(0, self.select_index - 1)
                self._invalidate()

        @kb.add("down")
        def _down(event):
            if self.mode == "menu":
                self.menu.move(1)
                self._invalidate()
            elif self.mode == "select":
                self.select_index = min(len(self.select_options) - 1, self.select_index + 1)
                self._invalidate()

        @kb.add("enter")
        def _enter(event):
            if self.mode == "menu":
                item = self.menu.items[self.menu.selected]
                if item.action:
                    self._run_action(item.action)
            elif self.mode == "input":
                self._submit_input()
            elif self.mode == "select":
                self._submit_select()

        @kb.add("escape")
        def _escape(event):
            if self.mode == "monitor":
                self._run_action(self._exit_monitor)
            elif self.mode in ("input", "select"):
                self._cancel_input()
            elif self.mode == "menu":
                if self.menu.parent:
                    self._pop_menu()

        @kb.add("q")
        def _q(event):
            if self.mode == "menu":
                self._run_action(self._quit)
            elif self.mode == "input":
                self.input_value += "q"
                self._invalidate()

        @kb.add("backspace")
        def _backspace(event):
            if self.mode == "input" and self.input_value:
                self.input_value = self.input_value[:-1]
                self._invalidate()

        # Printable character input
        @kb.add("<any>")
        def _any_key(event):
            if self.mode == "input":
                char = event.data
                if char.isprintable() and len(char) == 1:
                    self.input_value += char
                    self._invalidate()

        return kb

    # ───────────────────────────────────────────────────────────────────
    # Application lifecycle
    # ───────────────────────────────────────────────────────────────────

    async def run_async(self) -> None:
        content = FormattedTextControl(self._render)
        body = Window(content=content, wrap_lines=True)
        layout = Layout(body)
        kb = self._build_keybindings()

        self.app = Application(
            layout=layout,
            key_bindings=kb,
            style=CLI_STYLE,
            full_screen=True,
            mouse_support=False,
        )

        async def _startup():
            if self._startup_machine:
                await self._refresh_machines()
                want = self._startup_machine
                m = next((x for x in self.machines if x.get("paired") and (
                    x["device_id"].startswith(want) or want in (x.get("name"), x.get("hostname")))), None)
                if m:
                    await self._select_target(m["device_id"], m.get("name") or m["hostname"])
                else:
                    self._set_status(f"--machine {want!r} is not a paired machine; see Machines",
                                     error=True)

        self.app.create_background_task(_startup())
        await self.app.run_async()

