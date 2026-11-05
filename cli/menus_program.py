"""Program, preset, paradigm, Pavlovian and limit menus for the REACHER CLI."""

from __future__ import annotations

from collections.abc import Callable, Mapping

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

SCALAR_CODE_MIN = 206
SCALAR_CODE_MAX = 219


def _spec_code(spec: Mapping[str, object]) -> int | None:
    """Return a command spec's integer code, or None when it has none."""
    code = spec.get("code")
    return code if isinstance(code, int) and not isinstance(code, bool) else None


def _pavlovian_label(code: int, spec: Mapping[str, object]) -> str:
    """Return the menu label for a Pavlovian command."""
    description = spec.get("description")
    return PAV_LABEL_OVERRIDES.get(code) or (str(description) if description else "") or f"Code {code}"


def _pavlovian_suffix(code: int, tracked: Mapping[int, object]) -> str:
    """Return the last value set for a Pavlovian command, formatted for the menu."""
    return f"({tracked[code]})" if code in tracked else ""


PARADIGM_SETTING_ROWS = (
    (("fr", "pr"), "Set Ratio", "Enter ratio:", "ratio", "ratio", 1),
    (("pr",), "Set PR Step", "Enter PR step:", "step", "step", 1),
    (("vi",), "Set VI Interval (ms)", "Enter VI interval (ms):", "vi_interval", "interval", 30000),
    (("omission",), "Set Omission Interval (ms)", "Enter omission interval (ms):", "om_interval", "interval", 30000),
)


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
        for paradigms, title, prompt, key, ps_key, default in PARADIGM_SETTING_ROWS:
            if paradigm in paradigms:
                items.append(
                    MenuItem(
                        title,
                        action=lambda prompt=prompt, key=key: self._prompt_int_input(
                            prompt, lambda v: self._send_paradigm_setting(key, v)
                        ),
                        suffix=f"({ps.get(ps_key, default)})",
                    )
                )
        if not items:
            hint = "Pavlovian: use Pavlovian Settings" if paradigm == "pavlovian" else "No paradigm selected"
            items.append(MenuItem(f"──── {hint} ────", is_separator=True))

        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Paradigm Settings", items=items)

    def _pavlovian_scalar_action(self, code: int, label: str, spec: dict[str, object]) -> Callable[[], object]:
        """Return the prompt action for one scalar Pavlovian command."""
        if code in ITI_CODES:
            # Cross-validated against the other ITI values (Min <= Mean <= Max).
            return lambda: self._prompt_int_input(f"Enter {label}:", lambda v: self._send_pavlovian_iti(code, v))
        if spec.get("payload_type") == "bool":
            return lambda: self._prompt_select(
                f"{label}:",
                [("Off", "0"), ("On", "1")],
                lambda v: self._set_pavlovian_param(code, int(v)),
            )
        return lambda: self._prompt_int_input(f"Enter {label}:", lambda v: self._set_pavlovian_param(code, v))

    def _pavlovian_menu(self) -> MenuState:
        """Build the Pavlovian parameter menu from the firmware's command registry."""
        s = self.session
        tracked = s.pavlovian_params if s else {}
        # The param *list* is sourced dynamically from reacher's registry
        # (paradigm-filtered + deprecation-stripped server-side), so re-enabled
        # params surface automatically. Rendered in two blocks mirroring
        # PavlovianSettings.tsx: scalar (206-219 sans ITI) and pulse config. Each
        # path records the value so the suffix reflects the last value set this session.
        specs = s.pav_commands if s else []
        coded = [(code, sp) for sp in specs if (code := _spec_code(sp)) is not None]
        scalar = sorted(
            ((code, sp) for code, sp in coded if sp.get("payload_key") and SCALAR_CODE_MIN <= code <= SCALAR_CODE_MAX),
            key=lambda pair: pair[0],
        )
        # Pulse-configuration block (0 = continuous tone), also registry-sourced.
        pulse = sorted(
            ((code, sp) for code, sp in coded if code in PULSE_CODES),
            key=lambda pair: pair[0],
        )
        items = [self._pavlovian_scalar_item(code, sp, tracked) for code, sp in scalar]
        items.extend(self._pavlovian_pulse_item(code, sp, tracked) for code, sp in pulse)
        if not scalar and not pulse:
            items.append(MenuItem("Reload commands", action=self._load_commands))
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Program > Pavlovian Settings", items=items)

    def _pavlovian_scalar_item(self, code: int, spec: dict[str, object], tracked: Mapping[int, object]) -> MenuItem:
        """Build the menu item for one scalar Pavlovian command."""
        label = _pavlovian_label(code, spec)
        action = self._pavlovian_scalar_action(code, label, spec)
        return MenuItem(f"Set {label}", action=action, suffix=_pavlovian_suffix(code, tracked))

    def _pavlovian_pulse_item(self, code: int, spec: Mapping[str, object], tracked: Mapping[int, object]) -> MenuItem:
        """Build the menu item for one pulse-configuration command."""
        label = _pavlovian_label(code, spec)
        return MenuItem(
            f"Set {label}",
            action=lambda: self._prompt_int_input(f"Enter {label}:", lambda v: self._set_pavlovian_param(code, v)),
            suffix=_pavlovian_suffix(code, tracked),
        )

    def _counted_pumps_item(self, counted: object) -> MenuItem:
        """Build the Counted Pumps item, labelled with the current choice."""
        counted_label = next(
            (label for label, pumps in COUNTED_PUMP_CHOICES.values() if pumps == counted), str(counted)
        )
        return MenuItem(
            "Set Counted Pumps",
            action=lambda: self._prompt_select(
                "Select Counted Pumps",
                [(label, key) for key, (label, _) in COUNTED_PUMP_CHOICES.items()],
                self._set_counted_pumps,
            ),
            suffix=f"({counted_label})",
        )

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
            items.insert(3, self._counted_pumps_item(s.limit_settings.get("counted_pumps")))
        return MenuState(title="Program > Limits", items=items)
