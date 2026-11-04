"""Menu builders and navigation for the REACHER CLI."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from . import presets as P
from .constants import (
    COUNTED_PUMP_CHOICES,
    DEVICE_BY_ID,
    DEVICE_CONFIGS,
    ITI_CODES,
    LASER_MODE_ITEMS,
    LEVER_FILTER_LABELS,
    LIMIT_TYPES_OPERANT,
    LIMIT_TYPES_PAVLOVIAN,
    PAV_LABEL_OVERRIDES,
    PULSE_CODES,
)
from .host import CliHost
from .state import MenuItem, MenuState

if TYPE_CHECKING:
    pass


def _digits(code: str) -> str:
    """Pairing codes are shown as ``482-091``; the backend wants ``482091``."""
    return "".join(ch for ch in code if ch.isdigit())


class MenuMixin(CliHost):
    """Menu builders and navigation, mixed into ``ReacherCLI``."""

    def _main_menu(self) -> MenuState:
        """Build the top-level menu."""
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
        """Build the session menu (create, attach, connect, firmware, reset, destroy)."""
        s = self.session
        state_suffix = f"[{s.state}]" if s else ""
        items = [
            MenuItem("Create New Session", action=self._create_session),
            MenuItem("Attach to Existing Session", action=self._choose_attach),
            MenuItem("Connect", action=self._connect, suffix="[connected]" if s and s.state == "connected" else ""),
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
        """Build the hardware menu, listing only devices the running firmware has."""
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
            items.append(
                MenuItem(
                    cfg["label"],
                    action=lambda d=dev_id: self._push_menu(self._device_menu(d)),
                    suffix=suffix,
                )
            )
        items.append(MenuItem("\u2500\u2500\u2500\u2500 System \u2500\u2500\u2500\u2500", is_separator=True))
        items.append(MenuItem("Test Chain", action=self._test_chain))
        test_mode = self.session.test_mode if self.session else False
        items.append(
            MenuItem(
                "Test Mode Off" if test_mode else "Test Mode On",
                action=self._toggle_test_mode,
                suffix="[ON]" if test_mode else "",
            )
        )
        items.append(MenuItem("Back", action=self._pop_menu))
        return MenuState(title="Hardware", items=items)

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
        """Build the menu for one device: arm, test, parameters and role."""
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
            items.append(
                MenuItem(f"Set {p['label']}", action=action, suffix=f"({self._param_value(device_id, p['key'])})")
            )

        # Role (levers)
        if "role" in cfg:
            items.append(MenuItem("Set Active", action=lambda: self._send_hw_command(cfg["role"]["active"])))
            items.append(MenuItem("Set Inactive", action=lambda: self._send_hw_command(cfg["role"]["inactive"])))

        # Mode / phase (laser), filtered to what this firmware accepts
        if device_id == "laser":
            laser = s.hw["laser"] if s else {}
            items.append(
                MenuItem(
                    f"──── Mode: {laser.get('mode', '?')}  phase: {laser.get('phase', '?')} ────", is_separator=True
                )
            )
            for label, code in LASER_MODE_ITEMS:
                if allowed and code not in allowed:
                    continue
                items.append(MenuItem(label, action=lambda c=code: self._send_laser_mode(c)))

        items.append(MenuItem("Back", action=self._pop_menu))

        title = f"Hardware > {cfg['label']}"
        suffix = "[ARMED]" if armed else "[DISARMED]"
        return MenuState(title=f"{title}  {suffix}", items=items)

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

    def _monitor_menu(self) -> MenuState:
        """Build the monitor menu."""
        items = [
            MenuItem("View Status", action=self._view_status),
            MenuItem("Live Stream", action=self._enter_monitor),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Monitor", items=items)

    def _data_menu(self) -> MenuState:
        """Build the menu for file naming, export and data preview."""
        s = self.session
        where = "on the Pi" if self.api.is_remote else "on this machine"
        local_dir = s.file_config.get("local_dir") if s else None
        items = [
            MenuItem(
                "Set Filename",
                action=lambda: self._prompt_input("Enter filename:", self._set_filename),
                suffix=f"({s.file_config.get('filename') or '-'})" if s else "",
            ),
            MenuItem(
                f"Set Destination ({where})",
                action=lambda: self._prompt_input(f"Enter destination path {where}:", self._set_destination),
                suffix=f"({s.file_config.get('destination') or '~/Downloads'})" if s else "",
            ),
            MenuItem("Set Notes", action=lambda: self._prompt_input("Enter notes:", self._set_notes)),
            MenuItem(
                "Export ZIP",
                action=self._export_zip,
                suffix=f"({os.path.basename(s.last_export)})" if s and s.last_export else "",
            ),
        ]
        if self.api.is_remote:
            items.append(
                MenuItem(
                    "Download Last Export to This Machine",
                    action=self._download_last_export,
                    suffix="[done]" if s and s.last_download else "",
                )
            )
            items.append(
                MenuItem(
                    "Set Local Download Folder",
                    action=lambda: self._prompt_input(
                        "Enter local folder for downloaded exports:", self._set_local_dir
                    ),
                    suffix=f"({local_dir})" if local_dir else "",
                )
            )
        items += [
            MenuItem("View Data Preview", action=self._view_data_preview),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Data", items=items)

    def _machines_menu(self) -> MenuState:
        """Build the menu for choosing the control target and pairing machines."""
        remote = self.api.device_id
        items: list[MenuItem] = [MenuItem("──── Control target ────", is_separator=True)]
        items.append(
            MenuItem(
                "This machine (local)",
                action=lambda: self._select_target(None, "this machine"),
                suffix="[current]" if remote is None else "",
            )
        )
        paired = [m for m in self.machines if m.get("paired")]
        unpaired = [m for m in self.machines if not m.get("paired")]
        for m in paired:
            tag = "[current]" if m["device_id"] == remote else ("" if m.get("discovered") else "[not seen]")
            items.append(
                MenuItem(
                    f"{m.get('name') or m['hostname']}  {m.get('url', '')}",
                    action=lambda mm=m: self._select_target(mm["device_id"], mm.get("name") or mm["hostname"]),
                    suffix=tag,
                )
            )
        if unpaired:
            items.append(MenuItem("──── Discovered, not paired ────", is_separator=True))
            for m in unpaired:
                items.append(
                    MenuItem(
                        f"Pair {m['hostname']}  {m.get('url', '')}",
                        action=lambda mm=m: self._prompt_input(
                            f"Pairing code shown on {mm['hostname']}:",
                            lambda code, d=mm["device_id"]: self._pair(self.api.pair_device(d, _digits(code))),
                        ),
                    )
                )
        items += [
            MenuItem("──── Pairing ────", is_separator=True),
            MenuItem(
                "Pair by Code (any discovered device)",
                action=lambda: self._prompt_input(
                    "Pairing code shown on the device:", lambda code: self._pair(self.api.pair_by_code(_digits(code)))
                ),
            ),
            MenuItem(
                "Pair by URL + Code",
                action=lambda: self._prompt_input(
                    "Device URL (e.g. http://192.168.1.50:6229):", self._pair_by_url_step
                ),
            ),
            MenuItem(
                "Add Manually (URL + API key)",
                action=lambda: self._prompt_input(
                    "Device URL (e.g. http://192.168.1.50:6229):", self._pair_manual_step
                ),
            ),
        ]
        if paired:
            items.append(
                MenuItem(
                    "Unpair a Machine",
                    action=lambda: self._prompt_select(
                        "Unpair which machine?",
                        [(m.get("name") or m["hostname"], m["device_id"]) for m in paired],
                        self._unpair,
                    ),
                )
            )
        items += [
            MenuItem("Refresh", action=self._open_machines_menu),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Machines", items=items)

    # ───────────────────────────────────────────────────────────────────
    # Menu navigation
    # ───────────────────────────────────────────────────────────────────

    def _push_menu(self, menu: MenuState) -> None:
        """Open ``menu`` as a child of the current menu."""
        menu.parent = self.menu
        self.menu = menu
        self._invalidate()

    def _pop_menu(self) -> None:
        """Return to the parent menu."""
        if self.menu.parent:
            self.menu = self.menu.parent
            # Rebuild to reflect updated state
            self._rebuild_current_menu()
        self._invalidate()

    def _rebuild_current_menu(self) -> None:
        """Rebuild the current menu to reflect live state changes."""
        # Titles may carry a state suffix ("Name  [...]"); strip it to match the builder key.
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
            label = title[len("Hardware > ") :]
            dev = next((d for d in DEVICE_CONFIGS if d["label"] == label), None)
            if dev:
                builders[title] = lambda d=dev["id"]: self._device_menu(d)

        builder = builders.get(title)
        if builder:
            new_menu = builder()
            new_menu.parent = parent
            new_menu.selected = min(selected, len(new_menu.items) - 1)
            self.menu = new_menu
