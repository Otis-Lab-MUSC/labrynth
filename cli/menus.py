"""Menu builders and navigation for the REACHER CLI."""

from __future__ import annotations

import os

from .constants import (
    DEVICE_CONFIGS,
)
from .menus_device import DeviceMenuMixin
from .menus_program import ProgramMenuMixin
from .state import MenuItem, MenuState


def _digits(code: str) -> str:
    """Pairing codes are shown as ``482-091``; the backend wants ``482091``."""
    return "".join(ch for ch in code if ch.isdigit())


class MenuMixin(DeviceMenuMixin, ProgramMenuMixin):
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
        items += self._paired_machine_items(paired, remote)
        items += self._unpaired_machine_items(unpaired)
        items += self._pairing_items(paired)
        items += [
            MenuItem("Refresh", action=self._open_machines_menu),
            MenuItem("Back", action=self._pop_menu),
        ]
        return MenuState(title="Machines", items=items)

    def _paired_machine_items(self, paired: list[dict[str, object]], remote: str | None) -> list[MenuItem]:
        """Build one control-target item per paired machine."""
        items: list[MenuItem] = []
        for m in paired:
            tag = "[current]" if m["device_id"] == remote else ("" if m.get("discovered") else "[not seen]")
            items.append(
                MenuItem(
                    f"{m.get('name') or m['hostname']}  {m.get('url', '')}",
                    action=lambda mm=m: self._select_target(mm["device_id"], mm.get("name") or mm["hostname"]),
                    suffix=tag,
                )
            )
        return items

    def _unpaired_machine_items(self, unpaired: list[dict[str, object]]) -> list[MenuItem]:
        """Build one pairing item per discovered, unpaired machine."""
        if not unpaired:
            return []
        items = [MenuItem("──── Discovered, not paired ────", is_separator=True)]
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
        return items

    def _pairing_items(self, paired: list[dict[str, object]]) -> list[MenuItem]:
        """Build the pairing and unpairing entries."""
        items = [
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
        return items

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
