"""Firmware upload actions for the REACHER CLI."""

from __future__ import annotations

from . import presets as P
from .errors import API_ERRORS
from .host import CliHost
from .response_fields import read_str_list


class FirmwareActionsMixin(CliHost):
    """Firmware upload, mixed into ``ReacherCLI``."""

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
            paradigms = read_str_list(paradigms_resp.get("paradigms"))
        except API_ERRORS:
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
        except (ImportError, OSError, ValueError):
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
        except API_ERRORS as exc:
            self._set_status(f"Upload failed: {exc}", error=True)
        finally:
            if self.session and self.session.state == "uploading":
                self.session.state = "idle"
