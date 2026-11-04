"""Session, hardware and device menus for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .constants import (
    DEVICE_BY_ID,
    DEVICE_CONFIGS,
    LASER_MODE_ITEMS,
    LEVER_FILTER_LABELS,
)
from .host import CliHost
from .state import MenuItem, MenuState


class DeviceMenuMixin(CliHost):
    """Session, hardware and device menu builders."""

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

    def _device_param_items(self, device_id: str, cfg: dict[str, object], allowed: set[int]) -> list[MenuItem]:
        """Build the parameter items the running firmware declares.

        Lever filter and onset delay exist only on operant builds; timeout mode
        not on omission.
        """
        items = []
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
        return items

    def _laser_mode_items(self, allowed: set[int]) -> list[MenuItem]:
        """Build the laser mode and phase items, filtered to what this firmware accepts."""
        s = self.session
        laser = s.hw["laser"] if s else {}
        items = [
            MenuItem(f"──── Mode: {laser.get('mode', '?')}  phase: {laser.get('phase', '?')} ────", is_separator=True)
        ]
        for label, code in LASER_MODE_ITEMS:
            if allowed and code not in allowed:
                continue
            items.append(MenuItem(label, action=lambda c=code: self._send_laser_mode(c)))
        return items

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

        items += self._device_param_items(device_id, cfg, allowed)

        # Role (levers)
        if "role" in cfg:
            items.append(MenuItem("Set Active", action=lambda: self._send_hw_command(cfg["role"]["active"])))
            items.append(MenuItem("Set Inactive", action=lambda: self._send_hw_command(cfg["role"]["inactive"])))

        if device_id == "laser":
            items += self._laser_mode_items(allowed)

        items.append(MenuItem("Back", action=self._pop_menu))

        title = f"Hardware > {cfg['label']}"
        suffix = "[ARMED]" if armed else "[DISARMED]"
        return MenuState(title=f"{title}  {suffix}", items=items)
