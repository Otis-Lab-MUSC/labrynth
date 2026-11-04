"""Data export and file settings for the REACHER CLI."""

from __future__ import annotations

import os

from .host import CliHost


class DataActionsMixin(CliHost):
    """Export, download and file-setting actions, mixed into ``ReacherCLI``."""

    async def _set_filename(self, value: str) -> None:
        """Set the export file name."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.file_config["filename"] = value
        try:
            await self.api.set_file_config(self.session.id, filename=value)
            self._set_status(f"Filename set: {value}")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _set_destination(self, value: str) -> None:
        """Set the folder the export is written to."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.file_config["destination"] = value
        try:
            await self.api.set_file_config(self.session.id, destination=value)
            self._set_status(f"Destination set: {value}")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _set_notes(self, value: str) -> None:
        """Set the notes saved with the export."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        self.session.file_config["notes"] = value
        try:
            await self.api.set_file_config(self.session.id, notes=value)
            self._set_status("Notes set")
        except Exception as exc:
            self._set_status(f"Failed: {exc}", error=True)

    async def _export_zip(self, auto: bool = False) -> None:
        """Export the session's data as a ZIP and, for a remote target, download it."""
        s = self.session
        if not s:
            self._set_status("No session", error=True)
            return
        if s.exporting:
            return
        s.exporting = True
        try:
            # Mirror triggerAutoExport in web/src/hooks/useSessionWebSockets.ts.
            payload = {
                "session_name": s.name or None,
                "notes": s.file_config.get("notes") or None,
                "infusion_count": s.infusion_count,
                "press_count": s.press_count,
                "trial_count": s.trial_count,
                # The backend expects epoch milliseconds (file.py divides by 1000).
                "program_start_time": s.program_start * 1000 if s.program_start else None,
            }
            resp = await self.api.export_zip(s.id, **{k: v for k, v in payload.items() if v is not None})
            path = resp.get("file_path")
            s.last_export = path
            where = f" on {self.target_name}" if self.api.is_remote else ""
            self._log(f"  [export] Saved{where}: {path}")
            self._set_status(f"{'Auto-e' if auto else 'E'}xported{where}: {path}")
            if path and self.api.is_remote:
                await self._download_last_export()
        except Exception as exc:
            self._log(f"  [error] Export failed: {exc}", error=True)
            self._set_status(f"Export failed: {exc}", error=True)
        finally:
            s.exporting = False
            self._rebuild_current_menu()

    def _auto_export(self) -> None:
        """Export on END like the web does; pulls a copy to this machine when remote."""
        s = self.session
        if not s or s.exporting or s.last_export:
            return
        if self.app:
            self.app.create_background_task(self._export_zip(auto=True))

    async def _download_last_export(self) -> None:
        """Copy the last export from the target host to this machine."""
        s = self.session
        if not s or not s.last_export:
            self._set_status("Nothing exported yet — run Export ZIP first", error=True)
            return
        dest = s.file_config.get("local_dir") or os.path.join(os.path.expanduser("~/Downloads"), "reacher")
        try:
            local = await self.api.download_export(s.id, s.last_export, dest)
            s.last_download = local
            self._log(f"  [export] Copied to this machine: {local}")
            self._set_status(f"Downloaded: {local}")
        except Exception as exc:
            self._log(f"  [error] Download failed: {exc}", error=True)
            self._set_status(f"Download failed (the ZIP is still on {self.target_name}): {exc}", error=True)
        self._rebuild_current_menu()

    async def _set_local_dir(self, value: str) -> None:
        """Set the local folder for downloaded exports."""
        if self.session:
            self.session.file_config["local_dir"] = os.path.expanduser(value)
            self._set_status(f"Downloads will go to {self.session.file_config['local_dir']}")
            self._rebuild_current_menu()

    async def _view_data_preview(self) -> None:
        """Show the most recent recorded events in the status bar."""
        if not self.session:
            self._set_status("No session", error=True)
            return
        try:
            resp = await self.api.get_behavior(self.session.id)
            events = resp.get("data", [])
            if not events:
                self._set_status("No data recorded yet")
                return
            lines = []
            for e in events[-8:]:
                ts = e.get("start_timestamp", "")
                ts = f"{ts / 1000:.1f}s" if isinstance(ts, (int, float)) else ts
                lines.append(f"[{ts}] {e.get('device', '')}: {e.get('event', '')}")
            self._set_status(f"{resp.get('total', len(events))} events. Last: " + " | ".join(lines))
        except Exception as exc:
            self._set_status(f"Data fetch failed: {exc}", error=True)
