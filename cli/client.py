"""Async HTTP client for the REACHER backend API."""

from __future__ import annotations

import httpx

DEFAULT_BASE = "http://localhost:6229"


class ReacherClient:
    """Thin async wrapper around every REACHER REST endpoint."""

    def __init__(self, base_url: str = DEFAULT_BASE):
        self._http = httpx.AsyncClient(base_url=base_url, timeout=30.0)

    async def close(self):
        await self._http.aclose()

    async def _req(self, method: str, path: str, **kw) -> dict:
        r = await self._http.request(method, path, **kw)
        r.raise_for_status()
        return r.json()

    # ── Health ─────────────────────────────────────────────
    async def health(self):
        return await self._req("GET", "/health")

    # ── Sessions ───────────────────────────────────────────
    async def list_sessions(self):
        return await self._req("GET", "/api/sessions")

    async def create_session(self, port: str, paradigm: str | None = None):
        body: dict = {"port": port}
        if paradigm:
            body["paradigm"] = paradigm
        return await self._req("POST", "/api/sessions", json=body)

    async def destroy_session(self, sid: str):
        return await self._req("DELETE", f"/api/sessions/{sid}")

    async def reset_session(self, sid: str):
        return await self._req("POST", f"/api/sessions/{sid}/reset")

    # ── Serial ─────────────────────────────────────────────
    async def list_ports(self):
        return await self._req("GET", "/api/serial/ports")

    async def connect_serial(self, sid: str):
        return await self._req("POST", f"/api/serial/{sid}/connect")

    async def disconnect_serial(self, sid: str):
        return await self._req("POST", f"/api/serial/{sid}/disconnect")

    # ── Firmware ───────────────────────────────────────────
    async def list_boards(self):
        return await self._req("GET", "/api/firmware/boards")

    async def list_paradigms(self, board: str | None = None):
        params = {"board": board} if board else {}
        return await self._req("GET", "/api/firmware/paradigms", params=params)

    async def upload_firmware(self, sid: str, paradigm: str, board: str = "uno"):
        return await self._req(
            "POST",
            f"/api/firmware/upload/{sid}",
            json={"paradigm": paradigm, "board": board},
        )

    # ── Hardware ───────────────────────────────────────────
    async def send_command(self, sid: str, code: int, value: int | None = None):
        body: dict = {"code": code}
        if value is not None:
            body["value"] = value
        return await self._req("POST", f"/api/hardware/{sid}/command", json=body)

    async def get_commands(self, sid: str):
        return await self._req("GET", f"/api/hardware/{sid}/commands")

    async def get_config(self, sid: str):
        return await self._req("GET", f"/api/hardware/{sid}/config")

    # ── Program ────────────────────────────────────────────
    async def start_program(self, sid: str):
        return await self._req("POST", f"/api/program/{sid}/start")

    async def stop_program(self, sid: str):
        return await self._req("POST", f"/api/program/{sid}/stop")

    async def pause_program(self, sid: str):
        return await self._req("POST", f"/api/program/{sid}/pause")

    async def set_limit(self, sid: str, limit_type: str, **kw):
        return await self._req(
            "POST", f"/api/program/{sid}/limit", json={"type": limit_type, **kw}
        )

    # ── Data ───────────────────────────────────────────────
    async def get_behavior(self, sid: str, since: int | None = None):
        params = {"since": since} if since is not None else {}
        return await self._req("GET", f"/api/data/{sid}/behavior", params=params)

    async def get_frames(self, sid: str):
        return await self._req("GET", f"/api/data/{sid}/frames")

    async def export_zip(self, sid: str, **kw):
        return await self._req("POST", f"/api/file/{sid}/export/zip", json=kw)

    # ── File ───────────────────────────────────────────────
    async def set_file_config(self, sid: str, **kw):
        return await self._req("POST", f"/api/file/{sid}/config", json=kw)

    # ── Lifecycle ──────────────────────────────────────────
    async def shutdown(self):
        return await self._req("POST", "/api/lifecycle/shutdown")
