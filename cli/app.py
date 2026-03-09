"""REACHER CLI — Menu-driven terminal interface.

Arrow-key navigable menus with text prompts for input and live event
streaming.  Communicates with the REACHER backend over REST + WebSocket.
"""

from __future__ import annotations

import asyncio
import json
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

from .client import ReacherClient

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _safe_int(val: str, label: str = "value") -> int | None:
    """Parse *val* as int, returning None on failure (for user-facing prompts)."""
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════

DEVICE_CONFIGS: list[dict] = [
    {
        "id": "rh-lever",
        "label": "RH Lever",
        "arm": 1001,
        "disarm": 1000,
        "test": None,
        "params": [
            {"key": "timeout", "label": "Timeout (ms)", "code": 1074, "default": "20000"},
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
]

PARADIGM_SETTING_CODES = {
    "ratio": 201,
    "step": 205,
    "vi_interval": 204,
    "om_interval": 203,
    "trace_interval": 220,
}

PAVLOVIAN_PARAMS: list[dict] = [
    {"code": 206, "label": "CS+ Reward Prob (%)", "default": "100"},
    {"code": 207, "label": "CS- Reward Prob (%)", "default": "0"},
    {"code": 208, "label": "CS+ Count", "default": "50"},
    {"code": 209, "label": "CS- Count", "default": "50"},
    {"code": 210, "label": "CS+ Frequency (Hz)", "default": "12000"},
    {"code": 211, "label": "CS- Frequency (Hz)", "default": "3000"},
    {"code": 213, "label": "Cue Duration (ms)", "default": "2000"},
    {"code": 214, "label": "Trace Interval (ms)", "default": "1000"},
    {"code": 216, "label": "ITI Mean (ms)", "default": "30000"},
    {"code": 217, "label": "ITI Min (ms)", "default": "10000"},
    {"code": 218, "label": "ITI Max (ms)", "default": "90000"},
]

PRESET_COMMAND_MAP: dict[str, dict] = {
    "rh-lever": {"arm": 1001, "disarm": 1000, "params": {"timeout": 1074, "ratio": 1075}},
    "lh-lever": {"arm": 1301, "disarm": 1300, "params": {"timeout": 1374, "ratio": 1375}},
    "primary-cue": {"arm": 301, "disarm": 300, "params": {"frequency": 371, "duration": 372}},
    "secondary-cue": {"arm": 311, "disarm": 310, "params": {"frequency": 381, "duration": 382}},
    "primary-pump": {"arm": 401, "disarm": 400, "params": {"duration": 472}},
    "secondary-pump": {"arm": 411, "disarm": 410, "params": {"duration": 482}},
    "laser": {"arm": 601, "disarm": 600, "params": {"frequency": 671, "duration": 672}},
    "lick-circuit": {"arm": 501, "disarm": 500, "params": {}},
    "microscope": {"arm": 901, "disarm": 900, "params": {}},
}

PRESETS: dict[str, dict] = {
    "sa-high": {
        "name": "SA High",
        "paradigm": "fr",
        "hardware": {
            "rh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "lh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "primary-cue": {"armed": True, "frequency": 8000, "duration": 1600},
            "secondary-cue": {"armed": False},
            "primary-pump": {"armed": True, "duration": 2000},
            "secondary-pump": {"armed": False},
            "laser": {"armed": False, "frequency": 40, "duration": 5000},
            "lick-circuit": {"armed": False},
            "microscope": {"armed": False},
        },
        "paradigm_settings": {"ratio": 1, "step": 1, "interval": 30000, "trace_interval": 0},
        "limits": {"type": "Both", "time_limit": 3600, "infusion_limit": 10, "delay": 60},
    },
    "sa-mid": {
        "name": "SA Mid",
        "paradigm": "fr",
        "hardware": {
            "rh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "lh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "primary-cue": {"armed": True, "frequency": 8000, "duration": 1600},
            "secondary-cue": {"armed": False},
            "primary-pump": {"armed": True, "duration": 2000},
            "secondary-pump": {"armed": False},
            "laser": {"armed": False},
            "lick-circuit": {"armed": False},
            "microscope": {"armed": False},
        },
        "paradigm_settings": {"ratio": 1, "step": 1, "interval": 30000, "trace_interval": 0},
        "limits": {"type": "Both", "time_limit": 3600, "infusion_limit": 20, "delay": 60},
    },
    "sa-low": {
        "name": "SA Low",
        "paradigm": "fr",
        "hardware": {
            "rh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "lh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "primary-cue": {"armed": True, "frequency": 8000, "duration": 1600},
            "secondary-cue": {"armed": False},
            "primary-pump": {"armed": True, "duration": 2000},
            "secondary-pump": {"armed": False},
            "laser": {"armed": False},
            "lick-circuit": {"armed": False},
            "microscope": {"armed": False},
        },
        "paradigm_settings": {"ratio": 1, "step": 1, "interval": 30000, "trace_interval": 0},
        "limits": {"type": "Both", "time_limit": 3600, "infusion_limit": 40, "delay": 60},
    },
    "sa-extinction": {
        "name": "SA Extinction",
        "paradigm": "fr",
        "hardware": {
            "rh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "lh-lever": {"armed": True, "timeout": 20000, "ratio": 1},
            "primary-cue": {"armed": True, "frequency": 8000, "duration": 1600},
            "secondary-cue": {"armed": False},
            "primary-pump": {"armed": False},
            "secondary-pump": {"armed": False},
            "laser": {"armed": False},
            "lick-circuit": {"armed": False},
            "microscope": {"armed": False},
        },
        "paradigm_settings": {"ratio": 1, "step": 1, "interval": 30000, "trace_interval": 0},
        "limits": {"type": "Time", "time_limit": 3600, "infusion_limit": 30, "delay": 60},
    },
}

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
    armed: dict = field(default_factory=dict)
    test_mode: bool = False
    paradigm_settings: dict = field(
        default_factory=lambda: {"ratio": 1, "step": 1, "interval": 30000, "trace_interval": 0}
    )
    limit_settings: dict = field(
        default_factory=lambda: {"type": "Time", "time_limit": 3600, "infusion_limit": 30, "delay": 60}
    )
    file_config: dict = field(default_factory=lambda: {"filename": "", "destination": "", "notes": ""})

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
})


# ═══════════════════════════════════════════════════════════════════════════
# ReacherCLI
# ═══════════════════════════════════════════════════════════════════════════


class ReacherCLI:
    def __init__(self, port: int = 6229):
        self.api = ReacherClient(base_url=f"http://localhost:{port}")
        self.port = port
        self.session: SessionState | None = None
        self.mode: str = "menu"  # "menu" | "input" | "monitor" | "select"
        self.status_message: str = ""
        self.status_is_error: bool = False

        # Input mode state
        self.input_prompt: str = ""
        self.input_value: str = ""
        self.input_callback: Callable | None = None

        # Select mode state (arrow-key selection from a list)
        self.select_title: str = ""
        self.select_options: list[tuple[str, str]] = []  # (label, value)
        self.select_index: int = 0
        self.select_callback: Callable | None = None

        # Monitor mode state
        self.monitor_lines: list[tuple[str, str]] = []  # (style, text)
        self._ws_task: asyncio.Task | None = None

        # Menu
        self.menu: MenuState = self._main_menu()

        # prompt_toolkit app (set up in run_async)
        self.app: Application | None = None

    # ───────────────────────────────────────────────────────────────────
    # Rendering
    # ───────────────────────────────────────────────────────────────────

    def _render(self) -> FormattedText:
        lines: list[tuple[str, str]] = []

        # Header
        status = "[connected]" if self.session and self.session.state not in ("idle",) else "[no session]"
        style = "class:header-status" if self.session else "class:header-disconnected"
        lines.append(("class:header", "REACHER CLI v2.0.0  "))
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
        lines.append(("class:input-text", f"  > {self.input_value}_\n"))
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
        elapsed = self.session.elapsed_str if self.session else "00:00:00"
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:monitor-header", f"Live Monitor                    Elapsed: {elapsed}\n"))
        lines.append(("class:separator", "\u2500" * 50 + "\n"))

        if self.session:
            inf = self.session.infusion_count
            prs = self.session.press_count
            st = self.session.state
            lines.append(("class:monitor-stats", f"  Infusions: {inf}  |  Presses: {prs}  |  State: {st}\n"))
            lines.append(("", "\n"))

        # Show last N lines (tail)
        visible = self.monitor_lines[-30:]
        for style, text in visible:
            lines.append((style, f"  {text}\n"))

        if not visible:
            lines.append(("class:separator", "  Waiting for events...\n"))

        lines.append(("", "\n"))
        lines.append(("class:help-bar", "[Esc] Exit monitor\n"))
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
            MenuItem("Connect", action=self._connect,
                     suffix="[connected]" if s and s.state == "connected" else ""),
            MenuItem("Disconnect", action=self._disconnect),
            MenuItem("Upload Firmware", action=self._upload_firmware),
            MenuItem("Reset Session", action=self._reset_session),
            MenuItem("Destroy Session", action=self._destroy_session),
            MenuItem("Session Info", action=self._show_session_info, suffix=state_suffix),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Session", items=items)

    def _hardware_menu(self) -> MenuState:
        items = []
        for cfg in DEVICE_CONFIGS:
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
        return MenuState(title="Hardware", items=items)

    def _device_menu(self, device_id: str) -> MenuState:
        cfg = DEVICE_BY_ID[device_id]
        armed = self.session.armed.get(device_id, False) if self.session else False
        items = []

        # Arm/disarm toggle
        if armed:
            items.append(MenuItem("Disarm", action=lambda: self._send_hw_command(cfg["disarm"])))
        else:
            items.append(MenuItem("Arm", action=lambda: self._send_hw_command(cfg["arm"])))

        # Test button
        if cfg.get("test") is not None:
            items.append(MenuItem("Test", action=lambda: self._send_hw_command(cfg["test"])))

        # Parameters
        for p in cfg.get("params", []):
            items.append(MenuItem(
                f"Set {p['label']}",
                action=lambda code=p["code"], lbl=p["label"]: self._prompt_int_input(
                    f"Enter {lbl}:", lambda val, c=code: self._send_hw_command(c, val)
                ),
                suffix=f"({p['default']})",
            ))

        # Role (levers)
        if "role" in cfg:
            items.append(MenuItem("Set Active",
                                  action=lambda: self._send_hw_command(cfg["role"]["active"])))
            items.append(MenuItem("Set Inactive",
                                  action=lambda: self._send_hw_command(cfg["role"]["inactive"])))

        # Mode (laser)
        if "mode" in cfg:
            items.append(MenuItem("Set Contingent",
                                  action=lambda: self._send_hw_command(cfg["mode"]["contingent"])))
            items.append(MenuItem("Set Independent",
                                  action=lambda: self._send_hw_command(cfg["mode"]["independent"])))

        items.append(MenuItem("Back", action=self._pop_menu))

        title = f"Hardware > {cfg['label']}"
        suffix = "[ARMED]" if armed else "[DISARMED]"
        return MenuState(title=f"{title}  {suffix}", items=items)

    def _program_menu(self) -> MenuState:
        s = self.session
        items = [
            MenuItem("Apply Preset", action=lambda: self._push_menu(self._preset_menu())),
            MenuItem("Paradigm Settings", action=lambda: self._push_menu(self._paradigm_settings_menu())),
        ]
        if s and s.paradigm == "pavlovian":
            items.append(MenuItem("Pavlovian Settings",
                                  action=lambda: self._push_menu(self._pavlovian_menu())))
        items.append(MenuItem("Limits", action=lambda: self._push_menu(self._limits_menu())))

        if s and s.state == "running":
            items.append(MenuItem("Stop Session", action=self._stop_program))
            items.append(MenuItem("Pause Session", action=self._pause_program))
        elif s and s.state == "paused":
            items.append(MenuItem("Stop Session", action=self._stop_program))
            items.append(MenuItem("Resume Session", action=self._pause_program))
        else:
            items.append(MenuItem("Start Session", action=self._start_program))

        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program", items=items)

    def _preset_menu(self) -> MenuState:
        items = []
        for key, preset in PRESETS.items():
            items.append(MenuItem(
                preset["name"],
                action=lambda k=key: self._apply_preset(k),
            ))
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Apply Preset", items=items)

    def _paradigm_settings_menu(self) -> MenuState:
        items = [
            MenuItem("Set Ratio", action=lambda: self._prompt_int_input(
                "Enter ratio:", lambda v: self._send_paradigm_setting("ratio", v)
            )),
            MenuItem("Set Step", action=lambda: self._prompt_int_input(
                "Enter step:", lambda v: self._send_paradigm_setting("step", v)
            )),
            MenuItem("Set VI Interval (ms)", action=lambda: self._prompt_int_input(
                "Enter VI interval (ms):", lambda v: self._send_paradigm_setting("vi_interval", v)
            )),
            MenuItem("Set OM Interval (ms)", action=lambda: self._prompt_int_input(
                "Enter OM interval (ms):", lambda v: self._send_paradigm_setting("om_interval", v)
            )),
            MenuItem("Set Trace Interval (ms)", action=lambda: self._prompt_int_input(
                "Enter trace interval (ms):", lambda v: self._send_paradigm_setting("trace_interval", v)
            )),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Program > Paradigm Settings", items=items)

    def _pavlovian_menu(self) -> MenuState:
        items = []
        for pp in PAVLOVIAN_PARAMS:
            items.append(MenuItem(
                f"Set {pp['label']}",
                action=lambda code=pp["code"], lbl=pp["label"]: self._prompt_int_input(
                    f"Enter {lbl}:", lambda v, c=code: self._send_hw_command(c, v)
                ),
                suffix=f"({pp['default']})",
            ))
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
        items = [
            MenuItem("Set Filename", action=lambda: self._prompt_input(
                "Enter filename:", self._set_filename)),
            MenuItem("Set Destination", action=lambda: self._prompt_input(
                "Enter destination path:", self._set_destination)),
            MenuItem("Set Notes", action=lambda: self._prompt_input(
                "Enter notes:", self._set_notes)),
            MenuItem("Export ZIP", action=self._export_zip),
            MenuItem("View Data Preview", action=self._view_data_preview),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Data", items=items)

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
        title = self.menu.title
        parent = self.menu.parent
        selected = self.menu.selected

        builders = {
            "Main Menu": self._main_menu,
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

        builder = builders.get(title)
        if builder:
            new_menu = builder()
            new_menu.parent = parent
            new_menu.selected = min(selected, len(new_menu.items) - 1)
            self.menu = new_menu

    # ───────────────────────────────────────────────────────────────────
    # Input / Select prompts
    # ───────────────────────────────────────────────────────────────────

    def _prompt_input(self, prompt: str, callback: Callable) -> None:
        self.mode = "input"
        self.input_prompt = prompt
        self.input_value = ""
        self.input_callback = callback
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
            self.session = SessionState(id=sid, port=port, paradigm=paradigm)
            self._set_status(f"Session created: {sid[:8]}...")
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
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Connect failed: {exc}", error=True)

    async def _disconnect(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.disconnect_serial(self.session.id)
            self.session.state = "idle"
            self._set_status("Serial disconnected")
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

    async def _finish_upload(self, board: str, paradigm: str) -> None:
        if not self.session:
            return
        try:
            self._set_status("Uploading firmware...")
            self.session.state = "uploading"
            await self.api.upload_firmware(self.session.id, paradigm, board)
            self.session.paradigm = paradigm
            self.session.board = board
            self.session.state = "connected"
            self._set_status(f"Firmware uploaded: {paradigm} ({board})")
            self._rebuild_current_menu()
        except Exception as exc:
            self.session.state = "idle"
            self._set_status(f"Upload failed: {exc}", error=True)

    async def _reset_session(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.reset_session(self.session.id)
            self.session.state = "idle"
            self.session.armed.clear()
            self.session.infusion_count = 0
            self.session.press_count = 0
            self.session.trial_count = 0
            self.session.program_start = None
            self.session.program_end = None
            self._set_status("Session reset")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Reset failed: {exc}", error=True)

    async def _destroy_session(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Destroy session? This cannot be undone.",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_destroy,
        )

    async def _confirm_destroy(self, choice: str) -> None:
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            await self.api.destroy_session(self.session.id)
            self.session = None
            self._set_status("Session destroyed")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Destroy failed: {exc}", error=True)

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
        try:
            await self.api.send_command(self.session.id, code, value)
            # Update armed state if this was an arm/disarm command
            for cfg in DEVICE_CONFIGS:
                if code == cfg["arm"]:
                    self.session.armed[cfg["id"]] = True
                    self._set_status(f"{cfg['label']} armed")
                    break
                elif code == cfg["disarm"]:
                    self.session.armed[cfg["id"]] = False
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

    async def _apply_preset(self, preset_key: str) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        preset = PRESETS[preset_key]
        self._set_status(f"Applying preset: {preset['name']}...")
        try:
            # Apply hardware settings
            for dev_id, hw_cfg in preset["hardware"].items():
                cmd_map = PRESET_COMMAND_MAP[dev_id]
                arm_code = cmd_map["arm"] if hw_cfg.get("armed") else cmd_map["disarm"]
                await self.api.send_command(self.session.id, arm_code)
                self.session.armed[dev_id] = hw_cfg.get("armed", False)
                for param_key, param_code in cmd_map.get("params", {}).items():
                    if param_key in hw_cfg:
                        val = _safe_int(str(hw_cfg[param_key]), param_key)
                        if val is not None:
                            await self.api.send_command(self.session.id, param_code, val)

            # Apply paradigm settings
            ps = preset.get("paradigm_settings", {})
            for key, code in PARADIGM_SETTING_CODES.items():
                if key in ps:
                    val = _safe_int(str(ps[key]), key)
                    if val is not None:
                        await self.api.send_command(self.session.id, code, val)
            self.session.paradigm_settings.update(ps)

            # Apply limits
            lim = preset.get("limits", {})
            if lim:
                await self.api.set_limit(self.session.id, **lim)
                self.session.limit_settings.update(lim)

            self._set_status(f"Preset '{preset['name']}' applied")
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
        self.session.paradigm_settings[key] = value

    async def _start_program(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.start_program(self.session.id)
            self.session.state = "running"
            self.session.program_start = time.time()
            self.session.program_end = None
            self._set_status("Session started")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Start failed: {exc}", error=True)

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

    async def _set_limit_type(self, limit_type: str) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings["type"] = limit_type
        try:
            await self.api.set_limit(self.session.id, **self.session.limit_settings)
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
            await self.api.set_limit(self.session.id, **self.session.limit_settings)
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
        self.monitor_lines.clear()
        self._invalidate()
        self._ws_task = asyncio.ensure_future(self._stream_events())

    async def _exit_monitor(self) -> None:
        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()
            self._ws_task = None
        self.mode = "menu"
        self._invalidate()

    async def _stream_events(self) -> None:
        if not self.session:
            return
        try:
            import websockets
        except ImportError:
            self.monitor_lines.append(("class:status-bar-error",
                                       "websockets not installed — cannot stream"))
            self._invalidate()
            return

        ws_url = f"ws://localhost:{self.port}/ws/{self.session.id}"
        try:
            async with websockets.connect(ws_url) as ws:
                # Periodic refresh for elapsed time display
                async def _refresh_loop():
                    while True:
                        await asyncio.sleep(1)
                        self._invalidate()

                refresh = asyncio.ensure_future(_refresh_loop())
                try:
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        self._handle_ws_message(msg)
                        self._invalidate()
                finally:
                    refresh.cancel()
        except asyncio.CancelledError:
            return
        except Exception as exc:
            self.monitor_lines.append(("class:status-bar-error", f"WebSocket error: {exc}"))
            self._invalidate()

    def _handle_ws_message(self, msg: dict) -> None:
        msg_type = msg.get("type", "")
        data = msg.get("data", msg)

        if msg_type == "event":
            device = data.get("device", "")
            event = data.get("event", "")
            ts = data.get("timestamp", "")
            if isinstance(ts, (int, float)):
                ts = time.strftime("%H:%M:%S", time.localtime(ts))
            self.monitor_lines.append((
                "class:monitor-event",
                f"[{ts}]  {device:<16} {event}"
            ))

            # Update counts
            if self.session:
                if event == "infusion":
                    self.session.infusion_count += 1
                elif event in ("active_press", "timeout_press", "inactive_press"):
                    self.session.press_count += 1
                    lever = "rh" if "rh" in device.lower() or "right" in device.lower() else "lh"
                    kind = event.replace("_press", "")
                    if lever == "rh":
                        self.session.rh_counts[kind] = self.session.rh_counts.get(kind, 0) + 1
                    else:
                        self.session.lh_counts[kind] = self.session.lh_counts.get(kind, 0) + 1

        elif msg_type == "session_state":
            state = data.get("state", "")
            if self.session and state:
                self.session.state = state
                if state == "running" and self.session.program_start is None:
                    self.session.program_start = time.time()
                elif state == "stopped":
                    self.session.program_end = time.time()

        elif msg_type == "config":
            if self.session:
                armed = data.get("armed", {})
                if armed:
                    self.session.armed.update(armed)

        elif msg_type == "log":
            level = data.get("level", "info")
            text = data.get("message", str(data))
            self.monitor_lines.append(("class:monitor-event", f"  [{level}] {text}"))

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
            self._set_status(f"Notes set")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _export_zip(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            resp = await self.api.export_zip(self.session.id, **self.session.file_config)
            path = resp.get("path", resp.get("file", "exported"))
            self._set_status(f"ZIP exported: {path}")
        except Exception as exc:
            self._set_status(f"Export failed: {exc}", error=True)

    async def _view_data_preview(self) -> None:
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            resp = await self.api.get_behavior(self.session.id)
            events = resp.get("events", resp.get("data", []))
            if not events:
                self._set_status("No data recorded yet")
                return
            last = events[-10:]
            lines = []
            for e in last:
                ts = e.get("timestamp", "")
                if isinstance(ts, (int, float)):
                    ts = time.strftime("%H:%M:%S", time.localtime(ts))
                dev = e.get("device", "")
                evt = e.get("event", "")
                lines.append(f"[{ts}] {dev}: {evt}")
            self._set_status(" | ".join(lines))
        except Exception as exc:
            self._set_status(f"Data fetch failed: {exc}", error=True)

    # ───────────────────────────────────────────────────────────────────
    # Quit
    # ───────────────────────────────────────────────────────────────────

    async def _quit(self) -> None:
        if self.session and self.session.state == "running":
            self._prompt_select(
                "Session is running. Quit anyway?",
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
        try:
            await self.api.close()
        except Exception:
            pass
        if self.app:
            self.app.exit()

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

        await self.app.run_async()
