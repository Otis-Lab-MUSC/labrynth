"""Session and menu state for the REACHER CLI."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from . import presets as P
from .preset_types import Hardware, ParadigmSettings


@dataclass
class SessionState:
    """Everything the CLI tracks about the one session it is controlling."""

    id: str
    port: str
    paradigm: str | None = None
    board: str | None = None
    state: str = "idle"
    name: str = ""
    notes: str = ""
    firmware_info: dict[str, object] | None = None
    behavior_data: list[dict[str, object]] = field(default_factory=list)
    frame_data: list[float] = field(default_factory=list)
    infusion_count: int = 0
    # Server-side counted total from the infusion_count WS event; None until one arrives.
    server_infusion_count: int | None = None
    infusions_by_pump: dict[str, object] | None = None
    press_count: int = 0
    trial_count: int = 0
    rh_counts: dict[str, int] = field(default_factory=lambda: {"active": 0, "timeout": 0, "inactive": 0})
    lh_counts: dict[str, int] = field(default_factory=lambda: {"active": 0, "timeout": 0, "inactive": 0})
    program_start: float | None = None
    program_end: float | None = None
    paused_time: float = 0
    pause_start: float | None = None
    # Device state in the web's shape (camelCase keys, nested contingency), so
    # the start-time dispatch in presets.py is shared with the web definitions.
    hw: Hardware = field(default_factory=P.default_hardware)
    test_mode: bool = False
    paradigm_settings: ParadigmSettings = field(default_factory=lambda: {"ratio": 1, "step": 1, "interval": 30000})
    pavlovian_params: dict[int, int] = field(default_factory=dict)  # {code: value}, last-set Pavlovian params
    limit_settings: dict[str, object] = field(
        default_factory=lambda: {
            "type": "Time",
            "time_limit": P.LIMIT_DEFAULTS["timeLimit"],
            "infusion_limit": P.LIMIT_DEFAULTS["infusionLimit"],
            "delay": P.LIMIT_DEFAULTS["delay"],
            "counted_pumps": None,
        }
    )
    file_config: dict[str, str] = field(default_factory=lambda: {"filename": "", "destination": "", "notes": ""})
    backend_event_count: int = 0
    # Pavlovian command specs sourced from reacher's registry (get_commands_for_paradigm)
    pav_commands: list[dict[str, object]] = field(default_factory=list)
    frame_count: int = 0
    cs_plus_count: int = 0
    cs_minus_count: int = 0
    # Last export: path on the host that ran the session, and the local copy.
    last_export: str | None = None
    last_download: str | None = None
    exporting: bool = False
    attached: bool = False  # re-attached to a session this process did not create

    @property
    def armed(self) -> dict[str, object]:
        """CLI device id -> armed, read-only view over ``hw``."""
        return {cli: bool(self.hw.get(web, {}).get("armed")) for web, cli in P.CLI_ID.items()}

    def behavior_count_hint(self) -> bool:
        """Return True once the backend has reported at least one event."""
        return self.backend_event_count > 0

    @property
    def allowed_codes(self) -> set[int]:
        """Return the command codes the running firmware declares."""
        codes = (c.get("code") for c in self.pav_commands)
        return {code for code in codes if isinstance(code, int)}

    @property
    def elapsed(self) -> float:
        """Return seconds of program time, excluding paused time."""
        if self.program_start is None:
            return 0.0
        end = self.program_end or time.time()
        extra = 0.0
        if self.pause_start is not None:
            extra = time.time() - self.pause_start
        return max(0.0, end - self.program_start - self.paused_time - extra)

    @property
    def elapsed_str(self) -> str:
        """Return the elapsed time as ``HH:MM:SS`` (``--:--:--`` for an attached run with unknown start)."""
        if self.program_start is None and self.attached and self.state in ("running", "paused"):
            return "--:--:--"
        s = int(self.elapsed)
        return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"

    @property
    def infusions_text(self) -> str:
        """Return the infusion counter line, preferring the server's counted total."""
        if self.server_infusion_count is None:
            return f"Infusions: {self.infusion_count}"
        by_pump = self.infusions_by_pump or {}
        p1, p2 = by_pump.get("PUMP_1", 0), by_pump.get("PUMP_2", 0)
        detail = f" (P1 {p1} / P2 {p2})" if p2 else ""
        return f"Infusions: {self.server_infusion_count} counted{detail}"


# ═══════════════════════════════════════════════════════════════════════════
# Menu model
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class MenuItem:
    """One row in a menu: a label, an optional action, and optional right-aligned info."""

    label: str
    action: Callable[..., object] | None = None  # async callable, or None for separator
    suffix: str = ""  # right-aligned info
    is_separator: bool = False


@dataclass
class MenuState:
    """A menu screen: its title, rows, highlighted row and parent menu."""

    title: str
    items: list[MenuItem]
    selected: int = 0
    parent: MenuState | None = None

    def selectable_count(self) -> int:
        """Return the number of rows that are not separators."""
        return sum(1 for i in self.items if not i.is_separator)

    def move(self, delta: int) -> None:
        """Move the highlight by ``delta`` rows, wrapping around and skipping separators."""
        if not self.items:
            return
        n = len(self.items)
        idx = self.selected
        for _ in range(n):
            idx = (idx + delta) % n
            if not self.items[idx].is_separator:
                break
        self.selected = idx
