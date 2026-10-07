"""Async HTTP client for the REACHER backend API.

The CLI always talks to the *local* backend. To drive a paired remote machine
(e.g. a Raspberry Pi), set ``device_id``: session-scoped calls are then routed
through the local backend's proxy (``/api/proxy/{device_id}/...``), which holds
the remote API key server-side, and the WebSocket goes through its relay. Only
the controller's backend ever needs to reach the Pi.
"""

from __future__ import annotations

import asyncio
import os
from urllib.parse import quote

import httpx

DEFAULT_BASE = "http://localhost:6229"
_KEY_FILE = os.path.expanduser("~/.reacher/api_key")

# Firmware flashing (avrdude + reboot + IDENTIFY) can outlast the default.
_UPLOAD_TIMEOUT = 180.0
# The backend rate-limits device commands (20/s per session); a preset apply
# sends a few dozen back to back.
_RATE_LIMIT_RETRIES = 5


def _read_api_key() -> str | None:
    """Read the API key from env or the default key file."""
    key = os.getenv("REACHER_API_KEY")
    if key:
        return key
    try:
        with open(_KEY_FILE) as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None


class ReacherClient:
    """Thin async wrapper around every REACHER REST endpoint."""

    def __init__(self, base_url: str = DEFAULT_BASE, device_id: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.device_id = device_id
        self.api_key = _read_api_key()
        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        self._http = httpx.AsyncClient(base_url=self.base_url, timeout=30.0, headers=headers)

    async def close(self):
        await self._http.aclose()

    # ── Target selection ───────────────────────────────────
    @property
    def is_remote(self) -> bool:
        return self.device_id is not None

    def set_target(self, device_id: str | None) -> None:
        """Route session calls to a paired machine (None = this machine)."""
        self.device_id = device_id

    def _path(self, path: str) -> str:
        """Prefix a target-scoped path with the proxy route when remote."""
        if self.device_id:
            return f"/api/proxy/{self.device_id}{path}"
        return path

    def ws_url(self, session_id: str) -> str:
        """WebSocket URL for a session on the current target.

        Both routes authenticate with the LOCAL key; the relay swaps in the
        remote key server-side.
        """
        ws_base = "ws" + self.base_url[len("http"):]
        path = (f"/api/proxy/{self.device_id}/ws/{session_id}" if self.device_id
                else f"/ws/{session_id}")
        token = f"?token={quote(self.api_key)}" if self.api_key else ""
        return f"{ws_base}{path}{token}"

    async def _req(self, method: str, path: str, *, local: bool = False, **kw) -> dict:
        url = path if local else self._path(path)
        r = await self._http.request(method, url, **kw)
        for attempt in range(_RATE_LIMIT_RETRIES):
            if r.status_code != 429:
                break
            await asyncio.sleep(0.25 * (attempt + 1))
            r = await self._http.request(method, url, **kw)
        if r.is_error:
            detail = ""
            try:
                detail = r.json().get("detail", "")
            except Exception:
                detail = r.text[:200]
            raise httpx.HTTPStatusError(
                f"{r.status_code} {detail or r.reason_phrase}", request=r.request, response=r,
            )
        return r.json()

    # ── Health ─────────────────────────────────────────────
    async def health(self):
        return await self._req("GET", "/health")

    # ── Sessions ───────────────────────────────────────────
    async def list_sessions(self):
        return await self._req("GET", "/api/sessions")

    async def get_session(self, sid: str):
        return await self._req("GET", f"/api/sessions/{sid}")

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

    async def upload_firmware(self, sid: str, paradigm: str, board: str = "uno", hex_data: str | None = None):
        body: dict = {"paradigm": paradigm, "board": board}
        if hex_data:
            body["hex_data"] = hex_data
        return await self._req(
            "POST",
            f"/api/firmware/upload/{sid}",
            json=body,
            timeout=_UPLOAD_TIMEOUT,
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

    async def split_segment(self, sid: str):
        return await self._req("POST", f"/api/program/{sid}/split")

    async def restart_program(self, sid: str):
        return await self._req("POST", f"/api/program/{sid}/restart")

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

    async def download_export(self, sid: str, remote_path: str, dest_dir: str) -> str:
        """Fetch an exported ZIP from the target host into ``dest_dir``.

        Needed for remote machines, where ``export_zip`` writes on the Pi.
        Returns the local file path.
        """
        r = await self._http.get(
            self._path(f"/api/file/{sid}/export/download"),
            params={"path": remote_path},
            timeout=120.0,
        )
        r.raise_for_status()
        os.makedirs(dest_dir, exist_ok=True)
        name = os.path.basename(remote_path) or "export.zip"
        local = os.path.join(dest_dir, name)
        stem, ext = os.path.splitext(local)
        n = 1
        while os.path.exists(local):
            local = f"{stem} ({n}){ext}"
            n += 1
        with open(local, "wb") as f:
            f.write(r.content)
        return local

    # ── File ───────────────────────────────────────────────
    async def set_file_config(self, sid: str, **kw):
        return await self._req("POST", f"/api/file/{sid}/config", json=kw)

    # ── Machines (always the local backend) ────────────────
    async def list_machines(self):
        """Paired and mDNS/scan-discovered machines (excludes this one)."""
        return await self._req("GET", "/api/discovery", local=True)

    async def pair_by_code(self, code: str, name: str | None = None):
        return await self._req("POST", "/api/discovery/pair-by-code", local=True,
                               json={"code": code, "name": name}, timeout=30.0)

    async def pair_device(self, device_id: str, code: str, name: str | None = None):
        return await self._req("POST", f"/api/discovery/{device_id}/pair", local=True,
                               json={"code": code, "name": name})

    async def pair_by_url(self, url: str, code: str, name: str | None = None):
        return await self._req("POST", "/api/discovery/pair-by-url", local=True,
                               json={"url": url, "code": code, "name": name})

    async def pair_manual(self, url: str, api_key: str, name: str | None = None):
        return await self._req("POST", "/api/discovery/manual", local=True,
                               json={"url": url, "api_key": api_key, "name": name})

    async def unpair(self, device_id: str):
        return await self._req("DELETE", f"/api/discovery/{device_id}", local=True)

    # ── Lifecycle ──────────────────────────────────────────
    async def shutdown(self):
        return await self._req("POST", "/api/lifecycle/shutdown", local=True)
