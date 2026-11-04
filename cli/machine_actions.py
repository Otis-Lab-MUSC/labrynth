"""Machine pairing and control target for the REACHER CLI."""

from __future__ import annotations

from collections.abc import Awaitable
from typing import TYPE_CHECKING

from .menus import _digits
from .host import CliHost

if TYPE_CHECKING:
    pass


class MachineActionsMixin(CliHost):
    """Pairing and control-target actions, mixed into ``ReacherCLI``."""

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
            self._set_status(
                f"Session {self.session.state} on {self.target_name} — detach first "
                "(Session > Detach); it keeps running",
                error=True,
            )
            return
        self._stop_ws()
        self.session = None
        self.monitor_lines.clear()
        self.api.set_target(device_id)
        self.target_name = name
        if device_id:
            try:
                h = await self.api.health()
                self._set_status(
                    f"Now controlling {name} (reacher {h.get('version', '?')}, "
                    f"{h.get('active_sessions', 0)} active sessions)"
                )
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
        self._prompt_input(
            f"Pairing code shown on {url}:", lambda code: self._pair(self.api.pair_by_url(url, _digits(code)))
        )

    async def _pair_manual_step(self, url: str) -> None:
        """Ask for the API key of the machine at ``url`` (input is masked)."""
        # The key is stored server-side in ~/.reacher/machines.json; it is
        # never echoed here (masked input) or kept in this process.
        self._prompt_input(
            f"API key of {url} (from ~/.reacher/api_key on that machine):",
            lambda key: self._pair(self.api.pair_manual(url, key.strip())),
            mask=True,
        )

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
