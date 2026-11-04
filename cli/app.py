"""REACHER CLI — Menu-driven terminal interface.

Arrow-key navigable menus with text prompts for input and live event
streaming.  Communicates with the REACHER backend over REST + WebSocket.
"""

from __future__ import annotations

import asyncio
import os
import time
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from prompt_toolkit import Application
from prompt_toolkit.formatted_text import FormattedText
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.layout import Layout, Window
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.styles import Style

from . import presets as P
from .preset_types import LimitDefaults
from .client import ReacherClient
from .constants import (  # noqa: F401 -- re-exported for callers of cli.app
    ITI_CODES,
    PAV_LABEL_OVERRIDES,
    PULSE_CODES,
    COUNTED_PUMP_CHOICES,
    DEVICE_CONFIGS,
    ITI_DEFAULTS,
    PARADIGM_SETTING_CODES,
    PUMP_DEVICES,
    SYSTEM_COMMANDS,
)
from .menus import MenuMixin, _digits
from .monitor import MonitorMixin
from .state import MenuState, SessionState

if TYPE_CHECKING:
    from prompt_toolkit.key_binding.key_processor import KeyPressEvent

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _limits_from_preset(limit_defaults: LimitDefaults) -> dict[str, object]:
    """Web ``limitDefaults`` (camelCase) -> the CLI's backend-shaped limits."""
    return {
        "type": limit_defaults.get("limitType", "Time"),
        "time_limit": int(limit_defaults.get("timeLimit", P.LIMIT_DEFAULTS["timeLimit"])),
        "infusion_limit": int(limit_defaults.get("infusionLimit", P.LIMIT_DEFAULTS["infusionLimit"])),
        "delay": int(limit_defaults.get("delay", P.LIMIT_DEFAULTS["delay"])),
        "counted_pumps": _counted_pumps_from_preset(limit_defaults.get("countedPumps")),
    }


def _counted_pumps_from_preset(value: object) -> list[str] | None:
    """Absent, empty, or only unknown pumps -> None (Auto), matching the web resolver."""
    if not isinstance(value, list):
        return None
    pumps = list(dict.fromkeys(p for p in value if p in ("PUMP_1", "PUMP_2")))
    return pumps or None


def _safe_int(val: str, label: str = "value") -> int | None:
    """Parse *val* as int, returning None on failure (for user-facing prompts)."""
    try:
        return int(val)
    except (ValueError, TypeError):
        return None



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


class ReacherCLI(MenuMixin, MonitorMixin):
    """The terminal UI: menus, prompts and live monitor over the REACHER backend."""

    def __init__(self, port: int = 6229, machine: str | None = None) -> None:
        """Create the CLI for the local backend on ``port``, optionally targeting a paired ``machine`` at startup."""
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
        self.input_callback: Callable[..., object] | None = None
        self.input_mask: bool = False

        # Select mode state (arrow-key selection from a list)
        self.select_title: str = ""
        self.select_options: list[tuple[str, str]] = []  # (label, value)
        self.select_index: int = 0
        self.select_callback: Callable[..., object] | None = None

        # Live feed. One WebSocket per session runs in the background for the
        # whole time a session is open (not only in Monitor mode): it keeps
        # state/arm/counter mirrors current and lets the host's idle watchdog
        # see a connected client during long runs.
        self.monitor_lines: list[tuple[str, str]] = []
        self._ws_task: asyncio.Task[None] | None = None
        self.ws_connected: bool = False

        # Menu
        self.menu: MenuState = self._main_menu()

        # prompt_toolkit app (set up in run_async)
        self.app: Application[None] | None = None

    # ───────────────────────────────────────────────────────────────────
    # Rendering
    # ───────────────────────────────────────────────────────────────────

    def _render(self) -> FormattedText:
        """Build the full screen for the current mode."""
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
        """Append the menu screen to ``lines``."""
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
        """Append the text-input prompt to ``lines``."""
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:input-prompt", self.input_prompt))
        lines.append(("", "\n\n"))
        shown = "*" * len(self.input_value) if self.input_mask else self.input_value
        lines.append(("class:input-text", f"  > {shown}_\n"))
        lines.append(("", "\n"))
        lines.append(("class:help-bar", "[Enter] Submit  [Esc] Cancel\n"))
        self._render_status(lines)

    def _render_select(self, lines: list[tuple[str, str]]) -> None:
        """Append the arrow-key selection list to ``lines``."""
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
        """Append the live monitor (counters and recent events) to ``lines``."""
        s = self.session
        elapsed = s.elapsed_str if s else "00:00:00"
        lines.append(("class:separator", "\u2550" * 50 + "\n"))
        lines.append(("class:monitor-header", f"Live Monitor                    Elapsed: {elapsed}\n"))
        lines.append(("class:separator", "\u2500" * 50 + "\n"))

        if s:
            if P.base_paradigm(s.paradigm) == "pavlovian":
                stats = (f"  Trials: {s.trial_count} (CS+ {s.cs_plus_count} / CS- {s.cs_minus_count})"
                         f"  |  {s.infusions_text}")
            else:
                rh, lh = s.rh_counts, s.lh_counts
                stats = (f"  {s.infusions_text}  |  Presses: {s.press_count}"
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
        """Append the status-bar message to ``lines`` if there is one."""
        if self.status_message:
            style = "class:status-bar-error" if self.status_is_error else "class:status-bar"
            lines.append((style, self.status_message + "\n"))

    def _invalidate(self) -> None:
        """Ask prompt_toolkit to redraw the screen."""
        if self.app:
            self.app.invalidate()

    def _set_status(self, msg: str, error: bool = False) -> None:
        """Show a message in the status bar and redraw."""
        self.status_message = msg
        self.status_is_error = error
        self._invalidate()

    # ───────────────────────────────────────────────────────────────────
    # Input / Select prompts
    # ───────────────────────────────────────────────────────────────────

    def _prompt_input(self, prompt: str, callback: Callable[..., object], mask: bool = False) -> None:
        """Switch to text-input mode and call ``callback`` with the submitted value."""
        self.mode = "input"
        self.input_prompt = prompt
        self.input_value = ""
        self.input_callback = callback
        self.input_mask = mask
        self._invalidate()

    def _prompt_int_input(self, prompt: str, callback: Callable[..., object]) -> None:
        """Like _prompt_input, but validates that the value is an integer."""
        def _validate(val: str) -> object | None:
            """Pass the value to the callback as an int, or report an invalid number."""
            n = _safe_int(val, prompt)
            if n is None:
                self._set_status(f"Invalid number: {val!r}", error=True)
                return
            return callback(n)
        self._prompt_input(prompt, _validate)

    def _prompt_select(self, title: str, options: list[tuple[str, str]], callback: Callable[..., object]) -> None:
        """Switch to selection mode and call ``callback`` with the chosen option's value."""
        self.mode = "select"
        self.select_title = title
        self.select_options = options
        self.select_index = 0
        self.select_callback = callback
        self._invalidate()

    def _submit_input(self) -> None:
        """Leave input mode and run the callback with the typed value."""
        value = self.input_value.strip()
        cb = self.input_callback
        self.mode = "menu"
        self.input_callback = None
        self._invalidate()
        if cb and value:
            self._run_action(lambda: cb(value))

    def _submit_select(self) -> None:
        """Leave selection mode and run the callback with the chosen value."""
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
        """Leave input or selection mode without running the callback."""
        self.mode = "menu"
        self.input_callback = None
        self.select_callback = None
        self._invalidate()

    # ───────────────────────────────────────────────────────────────────
    # Async action runner
    # ───────────────────────────────────────────────────────────────────

    def _run_action(self, coro_fn: Callable[..., object]) -> None:
        """Run a menu action in the background, reporting any exception in the status bar."""
        async def _wrapper() -> None:
            """Call the action, await it if it is a coroutine, and show failures in the status bar."""
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
        """Ask for a serial port, then create a session on it."""
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
        """Ask for an optional paradigm after a port is chosen."""
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
        """Create the session on the backend and make it the active one."""
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
        """Open the session's serial connection."""
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
        """Close the session's serial connection."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.disconnect_serial(self.session.id)
            self.session.state = "disconnected"
            self._set_status("Serial disconnected")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Disconnect failed: {exc}", error=True)

    async def _upload_firmware(self) -> None:
        """Ask for a board, then flash firmware; refused while the session is running."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        # The host refuses a reflash mid-run (409); say why before the board/paradigm prompts.
        if self.session.state in ("running", "paused", "uploading"):
            self._set_status(
                f"Can't upload firmware while the session is {self.session.state} — stop it first",
                error=True,
            )
            return
        self._prompt_select(
            "Select Board",
            [("Arduino Uno", "uno"), ("Arduino Mega", "mega")],
            self._on_board_selected,
        )

    async def _on_board_selected(self, board: str) -> None:
        """Ask for the paradigm to flash on the chosen board."""
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
        """Flash the chosen paradigm and reset local device state to the new firmware's defaults."""
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
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Failed to load commands: {exc}", error=True)

    async def _reset_session(self) -> None:
        """Reset the session on the backend and clear local counters and state."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            await self.api.reset_session(self.session.id)
            s = self.session
            s.state = "idle"
            s.hw = P.default_hardware()
            self._reset_counters()
            s.program_start = None
            s.program_end = None
            s.last_export = s.last_download = None
            self._set_status("Session reset")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Reset failed: {exc}", error=True)

    def _reset_counters(self) -> None:
        """Zero the local event counters."""
        s = self.session
        if not s:
            return
        s.infusion_count = s.press_count = s.trial_count = 0
        s.server_infusion_count = s.infusions_by_pump = None
        s.cs_plus_count = s.cs_minus_count = s.frame_count = 0
        s.backend_event_count = 0
        s.rh_counts = {"active": 0, "timeout": 0, "inactive": 0}
        s.lh_counts = {"active": 0, "timeout": 0, "inactive": 0}

    async def _destroy_session(self) -> None:
        """Ask for confirmation before destroying the session."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Destroy session? This cannot be undone.",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_destroy,
        )

    async def _confirm_destroy(self, choice: str) -> None:
        """Destroy the session if the operator confirmed."""
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
        """List the target's sessions and ask which to attach to."""
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
        # The server reports a list even in Auto mode, so only an explicit choice is kept;
        # otherwise the next limit edit would pin Auto to whichever pump is active now.
        if info.get("follows_reward_pump") is False:
            s.limit_settings["counted_pumps"] = info.get("counted_pumps")
        s.server_infusion_count = info.get("infusion_count")
        s.infusions_by_pump = info.get("infusions_by_pump")
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
        """Show the session's id, port, state, paradigm and board in the status bar."""
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
        """Send a firmware command and record it locally so the start-time re-send carries it."""
        if not self.session:
            self._set_status("No session", error=True)
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
        """Send a laser mode command, preceded by contingent mode for trial-paired modes."""
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
        """Run the firmware's test chain."""
        await self._send_hw_command(SYSTEM_COMMANDS["test_chain"])

    async def _toggle_test_mode(self) -> None:
        """Flip test mode locally and tell the firmware."""
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
        preset = P.PRESET_BY_ID[preset_id]
        # Same rule as the web panel: a preset is pre-start configuration, so it is
        # refused mid-run instead of rewriting the displayed settings and limits.
        if s.state in ("running", "paused", "uploading"):
            self._set_status(
                f"Can't apply a preset while the session is {s.state} — stop it first", error=True
            )
            return
        self._set_status(f"Applying preset: {preset['name']}...")
        try:
            merged = P.merge_preset_hardware(s.hw, preset)
            s.hw = merged
            dropped: list[int] = []
            # Commands only go out pre-start (connected/stopped). In idle/disconnected
            # the state is staged and sent by the start-time re-send, like the web.
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
        """Send one paradigm setting (ratio, step or interval) to the firmware."""
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
        missing = P.missing_limit_fields(self._web_limits())
        if missing:
            self._set_status(f"Set the limits first: {', '.join(missing)}", error=True)
            return False
        try:
            await self._send_limits()
            await self._send_commands(P.start_commands(
                s.paradigm, s.hw, s.paradigm_settings, s.pavlovian_params))
            return True
        except Exception as exc:
            self._set_status(f"Start aborted — config not applied: {exc}", error=True)
            return False

    async def _start_program(self) -> None:
        """Apply the pre-run configuration and start the program."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            if not await self._prepare_run():
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

    async def _stop_program(self) -> None:
        """Ask for confirmation before stopping the program."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Stop session?",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_stop,
        )

    async def _confirm_stop(self, choice: str) -> None:
        """Stop the program if the operator confirmed."""
        if choice != "yes" or not self.session:
            self._set_status("Cancelled")
            return
        try:
            result = await self.api.stop_program(self.session.id)
            if result.get("status") == "not_running":
                self._set_status("Nothing was running")
                return
            self.session.state = "stopped"
            self.session.program_end = time.time()
            self._set_status("Session stopped")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Stop failed: {exc}", error=True)

    async def _pause_program(self) -> None:
        """Pause a running program or resume a paused one."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            was_paused = self.session.state == "paused"
            result = await self.api.pause_program(self.session.id)
            # The session_state WS update can land before this response, so
            # branch on what the backend did rather than on local state.
            status = result.get("status") if isinstance(result, dict) else None
            if status == "resumed" or (status != "paused" and was_paused):
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
        """End the current data segment and begin a new one."""
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
        """Ask for confirmation before restarting the program."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self._prompt_select(
            "Restart program? (Arduino will stop and re-start)",
            [("Yes", "yes"), ("No", "no")],
            self._confirm_restart,
        )

    async def _confirm_restart(self, choice: str) -> None:
        """Restart the program if the operator confirmed."""
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

    def _web_limits(self) -> P.LimitSettings:
        """Build the web-shaped limit payload from the session limits."""
        lim = self.session.limit_settings
        return {"limitType": lim["type"], "timeLimit": lim["time_limit"],
                "infusionLimit": lim["infusion_limit"], "delay": lim["delay"],
                "countedPumps": lim.get("counted_pumps")}

    async def _send_limits(self) -> bool:
        """Send the limits set so far. False when none are set yet (nothing is sent)."""
        body = P.limit_payload(self._web_limits())
        if body is None:
            return False
        limit_type = str(body.pop("type"))
        await self.api.set_limit(self.session.id, limit_type, **body)
        return True

    async def _set_limit_type(self, limit_type: str) -> None:
        """Set the limit type (time, infusion or both) and send the limits."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings["type"] = limit_type
        try:
            sent = await self._send_limits()
            self._set_status(f"Limit type set to {limit_type}" + ("" if sent else " (sent with the first limit you set)"))
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    async def _set_limit_value(self, key: str, value: int) -> None:
        """Set one numeric limit and send the limits."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.limit_settings[key] = value
        try:
            sent = await self._send_limits()
            self._set_status(f"{key} set to {value}" + ("" if sent else " (saved; sent once a limit above 0 is set)"))
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    async def _set_counted_pumps(self, key: str) -> None:
        """Choose which pumps count toward the infusion limit and send the limits."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        label, pumps = COUNTED_PUMP_CHOICES[key]
        self.session.limit_settings["counted_pumps"] = list(pumps) if pumps else None
        try:
            await self._send_limits()
            self._set_status(f"Counted pumps set to {label}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Set limit failed: {exc}", error=True)

    # ───────────────────────────────────────────────────────────────────
    # Monitor actions
    # ───────────────────────────────────────────────────────────────────

    async def _view_status(self) -> None:
        """Show elapsed time and counters in the status bar."""
        if not self.session:
            self._set_status("No session")
            return
        s = self.session
        self._set_status(
            f"Elapsed: {s.elapsed_str}  |  {s.infusions_text}  |  "
            f"Presses: {s.press_count}  |  State: {s.state}"
        )

    # ───────────────────────────────────────────────────────────────────
    # Data actions
    # ───────────────────────────────────────────────────────────────────

    async def _set_filename(self, value: str) -> None:
        """Set the export file name."""
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
        """Set the folder the export is written to."""
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
        """Set the notes saved with the export."""
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
        """Export the session's data as a ZIP and, for a remote target, download it."""
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
        """Copy the last export from the target host to this machine."""
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
        """Set the local folder for downloaded exports."""
        if self.session:
            self.session.file_config["local_dir"] = os.path.expanduser(value)
            self._set_status(f"Downloads will go to {self.session.file_config['local_dir']}")
            self._rebuild_current_menu()

    async def _view_data_preview(self) -> None:
        """Show the most recent recorded events in the status bar."""
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
        """Quit, asking first if a session is running or paused."""
        if self.session and self.session.state in ("running", "paused"):
            prompt = (
                f"Session is {self.session.state} on {self.target_name}. It keeps running "
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
        """Quit if the operator confirmed."""
        if choice == "yes":
            await self._do_quit()
        else:
            self._set_status("Cancelled")

    async def _do_quit(self) -> None:
        """Stop the WebSocket, close the HTTP client and exit the app."""
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
        """Reload the list of paired and discovered machines."""
        try:
            self.machines = (await self.api.list_machines()).get("devices", [])
        except Exception as exc:
            self.machines = []
            self._set_status(f"Machine list failed: {exc}", error=True)

    async def _open_machines_menu(self) -> None:
        """Refresh the machine list and show the machines menu."""
        await self._refresh_machines()
        if self.menu.title == "Machines":
            self._rebuild_current_menu()
        else:
            self._push_menu(self._machines_menu())
        self._invalidate()

    async def _select_target(self, device_id: str | None, name: str) -> None:
        """Switch control to another machine, refusing while a session is running there."""
        if device_id == self.api.device_id:
            return
        if self.session and self.session.state in ("running", "paused"):
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

    async def _pair(self, coro: Awaitable[dict[str, object]]) -> None:
        """Await a pairing call, then refresh the machine list."""
        try:
            m = await coro
            await self._refresh_machines()
            self._set_status(f"Paired {m.get('name') or m.get('hostname')} at {m.get('url')}")
            self._rebuild_current_menu()
        except Exception as exc:
            self._set_status(f"Pairing failed: {exc}", error=True)

    async def _pair_by_url_step(self, url: str) -> None:
        """Ask for the pairing code of the machine at ``url``."""
        self._prompt_input(f"Pairing code shown on {url}:",
                           lambda code: self._pair(self.api.pair_by_url(url, _digits(code))))

    async def _pair_manual_step(self, url: str) -> None:
        """Ask for the API key of the machine at ``url`` (input is masked)."""
        # The key is stored server-side in ~/.reacher/machines.json; it is
        # never echoed here (masked input) or kept in this process.
        self._prompt_input(f"API key of {url} (from ~/.reacher/api_key on that machine):",
                           lambda key: self._pair(self.api.pair_manual(url, key.strip())), mask=True)

    async def _unpair(self, device_id: str) -> None:
        """Unpair a machine, switching back to this machine first if it is the target."""
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
        """Create the key bindings for every mode.

        Up/down move the highlight, Enter selects or submits, Escape goes back, ``q`` quits
        from a menu, and printable keys, Backspace edit the text in input mode.
        """
        kb = KeyBindings()

        @kb.add("up")
        def _up(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                self.menu.move(-1)
                self._invalidate()
            elif self.mode == "select":
                self.select_index = max(0, self.select_index - 1)
                self._invalidate()

        @kb.add("down")
        def _down(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                self.menu.move(1)
                self._invalidate()
            elif self.mode == "select":
                self.select_index = min(len(self.select_options) - 1, self.select_index + 1)
                self._invalidate()

        @kb.add("enter")
        def _enter(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                item = self.menu.items[self.menu.selected]
                if item.action:
                    self._run_action(item.action)
            elif self.mode == "input":
                self._submit_input()
            elif self.mode == "select":
                self._submit_select()

        @kb.add("escape")
        def _escape(event: KeyPressEvent) -> None:
            if self.mode == "monitor":
                self._run_action(self._exit_monitor)
            elif self.mode in ("input", "select"):
                self._cancel_input()
            elif self.mode == "menu":
                if self.menu.parent:
                    self._pop_menu()

        @kb.add("q")
        def _q(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                self._run_action(self._quit)
            elif self.mode == "input":
                self.input_value += "q"
                self._invalidate()

        @kb.add("backspace")
        def _backspace(event: KeyPressEvent) -> None:
            if self.mode == "input" and self.input_value:
                self.input_value = self.input_value[:-1]
                self._invalidate()

        # Printable character input
        @kb.add("<any>")
        def _any_key(event: KeyPressEvent) -> None:
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
        """Build the prompt_toolkit app and run it until the user quits."""
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

        async def _startup() -> None:
            """Switch to the machine named by ``--machine``, if one was given."""
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

