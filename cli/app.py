"""REACHER CLI — Menu-driven terminal interface.

Arrow-key navigable menus with text prompts for input and live event
streaming.  Communicates with the REACHER backend over REST + WebSocket.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from prompt_toolkit import Application
from prompt_toolkit.formatted_text import FormattedText
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.layout import Layout, Window
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.styles import Style

from . import presets as P
from .attach_actions import AttachActionsMixin
from .client import ReacherClient
from .constants import (  # noqa: F401 -- re-exported for callers of cli.app
    COUNTED_PUMP_CHOICES,
    DEVICE_CONFIGS,
    ITI_CODES,
    ITI_DEFAULTS,
    PARADIGM_SETTING_CODES,
    PAV_LABEL_OVERRIDES,
    PULSE_CODES,
    PUMP_DEVICES,
    SYSTEM_COMMANDS,
)
from .data_actions import DataActionsMixin
from .errors import API_ERRORS
from .firmware_actions import FirmwareActionsMixin
from .hardware_actions import HardwareActionsMixin
from .machine_actions import MachineActionsMixin
from .menus import MenuMixin
from .monitor import MonitorMixin
from .program_actions import ProgramActionsMixin
from .run_actions import RunActionsMixin
from .session_actions import SessionActionsMixin
from .state import MenuState, SessionState
from .ws_messages import WsMessageMixin

if TYPE_CHECKING:
    from prompt_toolkit.key_binding.key_processor import KeyPressEvent

LOGGER = logging.getLogger(__name__)

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


class ReacherCLI(
    AttachActionsMixin,
    DataActionsMixin,
    FirmwareActionsMixin,
    WsMessageMixin,
    MachineActionsMixin,
    MenuMixin,
    MonitorMixin,
    HardwareActionsMixin,
    ProgramActionsMixin,
    RunActionsMixin,
    SessionActionsMixin,
):
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
            except Exception as exc:  # noqa: BLE001 -- main-loop boundary: reports whatever the narrowed handlers let escape
                self._set_status(f"Error: {exc}", error=True)
        if self.app:
            self.app.create_background_task(_wrapper())

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
        except API_ERRORS as exc:
            LOGGER.debug("Closing the API client failed: %s", exc)
        if self.app:
            self.app.exit()

    # ───────────────────────────────────────────────────────────────────
    # Key bindings
    # ───────────────────────────────────────────────────────────────────

    def _build_keybindings(self) -> KeyBindings:
        """Create the key bindings for every mode.

        Up/down move the highlight, Enter selects or submits, Escape goes back, ``q`` quits
        from a menu, and printable keys, Backspace edit the text in input mode.
        """
        kb = KeyBindings()
        self._bind_navigation_keys(kb)
        self._bind_editing_keys(kb)
        return kb

    def _bind_navigation_keys(self, kb: KeyBindings) -> None:
        """Bind arrows, Enter and Escape."""

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

    def _bind_editing_keys(self, kb: KeyBindings) -> None:
        """Bind ``q``, Backspace and printable characters."""

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

