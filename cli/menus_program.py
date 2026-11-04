"""Program, preset, paradigm, Pavlovian and limit menus for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .constants import (
    COUNTED_PUMP_CHOICES,
    ITI_CODES,
    LIMIT_TYPES_OPERANT,
    LIMIT_TYPES_PAVLOVIAN,
    PAV_LABEL_OVERRIDES,
    PULSE_CODES,
)
from .host import CliHost
from .state import MenuItem, MenuState


class ProgramMenuMixin(CliHost):
    """Program-related menu builders."""

    def _program_menu(self) -> MenuState:
        """Build the program menu, with run controls matching the session state."""
        s = self.session
        items: list[MenuItem] = []
        items.append(MenuItem("Apply Preset", action=lambda: self._push_menu(self._preset_menu())))
        items.append(MenuItem("Paradigm Settings", action=lambda: self._push_menu(self._paradigm_settings_menu())))
        if s and s.paradigm == "pavlovian":
            items.append(MenuItem("Pavlovian Settings", action=lambda: self._push_menu(self._pavlovian_menu())))
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
        else:
            items.append(MenuItem("Start Session", action=self._start_program))

        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program", items=items)

    def _preset_menu(self) -> MenuState:
        """Build the menu of built-in presets for the session's paradigm."""
        s = self.session
        items: list[MenuItem] = []
        presets = P.presets_for(s.paradigm) if s else []
        for preset in presets:
            items.append(
                MenuItem(
                    preset["name"],
                    action=lambda pid=preset["id"]: self._apply_preset(pid),
                )
            )
        if not presets:
            hint = (
                "Upload firmware or attach a session first"
                if not (s and s.paradigm)
                else f"No built-in presets for {s.paradigm}"
            )
            items.append(MenuItem(f"──── {hint} ────", is_separator=True))
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Apply Preset", items=items)

    def _paradigm_settings_menu(self) -> MenuState:
        """Build the menu of settings relevant to the active paradigm."""
        # Mirror web/src/components/program/ParadigmSettings.tsx: show only the
        # fields relevant to the active paradigm, with live value suffixes.
        s = self.session
        # Base name: fr_lite/pr_lite/... take the same settings as fr/pr/...
        paradigm = P.base_paradigm(s.paradigm) if s else None
        ps = s.paradigm_settings if s else {}

        items: list[MenuItem] = []
        if paradigm in ("fr", "pr"):
            items.append(
                MenuItem(
                    "Set Ratio",
                    action=lambda: self._prompt_int_input(
                        "Enter ratio:", lambda v: self._send_paradigm_setting("ratio", v)
                    ),
                    suffix=f"({ps.get('ratio', 1)})",
                )
            )
        if paradigm == "pr":
            items.append(
                MenuItem(
                    "Set PR Step",
                    action=lambda: self._prompt_int_input(
                        "Enter PR step:", lambda v: self._send_paradigm_setting("step", v)
                    ),
                    suffix=f"({ps.get('step', 1)})",
                )
            )
        if paradigm == "vi":
            items.append(
                MenuItem(
                    "Set VI Interval (ms)",
                    action=lambda: self._prompt_int_input(
                        "Enter VI interval (ms):", lambda v: self._send_paradigm_setting("vi_interval", v)
                    ),
                    suffix=f"({ps.get('interval', 30000)})",
                )
            )
        if paradigm == "omission":
            items.append(
                MenuItem(
                    "Set Omission Interval (ms)",
                    action=lambda: self._prompt_int_input(
                        "Enter omission interval (ms):", lambda v: self._send_paradigm_setting("om_interval", v)
                    ),
                    suffix=f"({ps.get('interval', 30000)})",
                )
            )
        if not items:
            hint = "Pavlovian: use Pavlovian Settings" if paradigm == "pavlovian" else "No paradigm selected"
            items.append(MenuItem(f"──── {hint} ────", is_separator=True))

        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Paradigm Settings", items=items)

    def _pavlovian_menu(self) -> MenuState:
        """Build the Pavlovian parameter menu from the firmware's command registry."""
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
            """Return the menu label for a Pavlovian command."""
            return PAV_LABEL_OVERRIDES.get(code) or spec.get("description") or f"Code {code}"

        def _suffix(code: int) -> str:
            """Return the last value set for a Pavlovian command, formatted for the menu."""
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
            items.append(
                MenuItem(
                    f"Set {label}",
                    action=lambda c=code, lbl=label: self._prompt_int_input(
                        f"Enter {lbl}:", lambda v, c2=c: self._set_pavlovian_param(c2, v)
                    ),
                    suffix=_suffix(code),
                )
            )

        if not scalar and not pulse:
            items.append(MenuItem("Reload commands", action=self._load_commands))
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Pavlovian Settings", items=items)

    def _limits_menu(self) -> MenuState:
        """Build the menu for the session's stop limits."""
        s = self.session
        current_type = s.limit_settings["type"] if s else "Time"
        limit_types = LIMIT_TYPES_PAVLOVIAN if (s and s.paradigm == "pavlovian") else LIMIT_TYPES_OPERANT
        items = [
            MenuItem(
                "Set Limit Type",
                action=lambda: self._prompt_select(
                    "Select Limit Type",
                    [(t, t) for t in limit_types],
                    self._set_limit_type,
                ),
                suffix=f"({current_type})",
            ),
            MenuItem(
                "Set Time Limit (s)",
                action=lambda: self._prompt_int_input(
                    "Enter time limit (seconds):", lambda v: self._set_limit_value("time_limit", v)
                ),
                suffix=f"({s.limit_settings['time_limit']})" if s else "",
            ),
            MenuItem(
                "Set Infusion Limit",
                action=lambda: self._prompt_int_input(
                    "Enter infusion limit:", lambda v: self._set_limit_value("infusion_limit", v)
                ),
                suffix=f"({s.limit_settings['infusion_limit']})" if s else "",
            ),
            MenuItem(
                "Set Delay (s)",
                action=lambda: self._prompt_int_input(
                    "Enter delay (seconds):", lambda v: self._set_limit_value("delay", v)
                ),
                suffix=f"({s.limit_settings['delay']})" if s else "",
            ),
            MenuItem("Back", action=self._pop_menu),
        ]
        if s and current_type in ("Infusion", "Both"):
            counted = s.limit_settings.get("counted_pumps")
            counted_label = next(
                (label for label, pumps in COUNTED_PUMP_CHOICES.values() if pumps == counted), str(counted)
            )
            items.insert(
                3,
                MenuItem(
                    "Set Counted Pumps",
                    action=lambda: self._prompt_select(
                        "Select Counted Pumps",
                        [(label, key) for key, (label, _) in COUNTED_PUMP_CHOICES.items()],
                        self._set_counted_pumps,
                    ),
                    suffix=f"({counted_label})",
                ),
            )
        return MenuState(title="Program > Limits", items=items)
