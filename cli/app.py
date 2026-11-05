"""REACHER CLI — Menu-driven terminal interface.

Arrow-key navigable menus with text prompts for input and live event
streaming.  Communicates with the REACHER backend over REST + WebSocket.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from prompt_toolkit import Application
from prompt_toolkit.layout import Layout, Window
from prompt_toolkit.layout.controls import FormattedTextControl

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
from .keybindings import KeyBindingsMixin
from .machine_actions import MachineActionsMixin
from .menus import MenuMixin
from .monitor import MonitorMixin
from .program_actions import ProgramActionsMixin
from .prompts import PromptMixin
from .render import RenderMixin
from .response_fields import read_str
from .run_actions import RunActionsMixin
from .session_actions import SessionActionsMixin
from .state import MenuState, SessionState
from .style import CLI_STYLE
from .ws_messages import WsMessageMixin

LOGGER = logging.getLogger(__name__)


def _matches_machine(machine: dict[str, object], want: str) -> bool:
    """Return True if ``want`` is the machine's device-id prefix, name, or hostname."""
    return read_str(machine.get("device_id")).startswith(want) or want in (
        machine.get("name"),
        machine.get("hostname"),
    )


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
    RenderMixin,
    PromptMixin,
    KeyBindingsMixin,
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
        self.machines: list[dict[str, object]] = []
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
        finally:
            if self.app:
                self.app.exit()

    # ───────────────────────────────────────────────────────────────────
    # Key bindings
    # ───────────────────────────────────────────────────────────────────
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
                m = next((x for x in self.machines if x.get("paired") and _matches_machine(x, want)), None)
                if m:
                    device_id = read_str(m.get("device_id"))
                    await self._select_target(device_id, read_str(m.get("name")) or read_str(m.get("hostname")))
                else:
                    self._set_status(f"--machine {want!r} is not a paired machine; see Machines",
                                     error=True)

        self.app.create_background_task(_startup())
        await self.app.run_async()
