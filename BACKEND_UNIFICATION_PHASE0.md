# Backend Unification: Phase 0 Implementation Guide

**Status**: Technical specification for Phase 0 execution  
**Phase**: Foundation (Weeks 1–2)  
**Deliverables**: Protocol + REST binding + in-process backend + resolver refactor  

---

## Overview

Phase 0 establishes the foundation without breaking existing deployments. All changes are **additive**: new modules only, no existing code touched. This enables parallel work and safe rollback.

```
Phase 0 Outputs:
├── reacher/backend/protocol.py       ← Core abstract interface (zero deps)
├── reacher/backend/rest_binding.py   ← HTTP transport implementation
├── reacher/backend/in_process.py     ← Direct backend (for tests)
├── reacher/backend/__init__.py       ← Public exports
├── reacher/firmware/resolver.py      ← (Refactored, existing import pattern unchanged)
└── reacher/backend/tests/           ← Unit tests for each binding
```

---

## File 1: `reacher/backend/protocol.py`

**Purpose**: Define the abstract backend interface. Zero internal imports.

**Constraints**:
- Only `stdlib` + `abc` + `dataclasses` + `typing`
- No `from reacher import ...` anywhere
- Strict Python 3.10+ typing

```python
"""Abstract backend protocol — all transports implement this."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Any, Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════
# Enums & Models
# ═══════════════════════════════════════════════════════════════════════════


class SessionState(str, Enum):
    """Session lifecycle states."""
    IDLE = "idle"
    UPLOADING = "uploading"
    CONNECTED = "connected"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    DISCONNECTED = "disconnected"
    ARMED = "armed"


@dataclass
class Session:
    """A REACHER experiment session."""
    id: str
    port: str
    paradigm: Optional[str] = None
    state: SessionState = SessionState.IDLE
    
    def model_dump(self) -> dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "id": self.id,
            "port": self.port,
            "paradigm": self.paradigm,
            "state": self.state.value,
        }
    
    @classmethod
    def model_validate(cls, data: dict) -> Session:
        """Construct from JSON dict."""
        return cls(
            id=data["id"],
            port=data["port"],
            paradigm=data.get("paradigm"),
            state=SessionState(data.get("state", "idle")),
        )


@dataclass
class FirmwareBoard:
    """Available firmware board and its paradigms."""
    board: str
    paradigms: list[str] = field(default_factory=list)


@dataclass
class HardwareConfig:
    """Hardware configuration snapshot."""
    session_id: str
    config: dict[str, Any]


# ═══════════════════════════════════════════════════════════════════════════
# Exceptions
# ═══════════════════════════════════════════════════════════════════════════


class BackendError(Exception):
    """Base exception for all backend operations.
    
    Attributes:
        code: HTTP-like status code (400, 401, 404, 409, 500, etc.)
        message: User-friendly error message
        detail: Optional detailed error info for logging
    """
    
    def __init__(
        self,
        message: str,
        code: int = 500,
        detail: Optional[str] = None
    ):
        self.message = message
        self.code = code
        self.detail = detail
        super().__init__(message)


class SessionNotFoundError(BackendError):
    """Session does not exist."""
    def __init__(self, session_id: str):
        super().__init__(f"Session {session_id} not found", code=404)


class UnauthorizedError(BackendError):
    """API key invalid or missing."""
    def __init__(self):
        super().__init__("Unauthorized", code=401)


class ConflictError(BackendError):
    """Operation conflicts with current state (e.g., start already-running session)."""
    def __init__(self, message: str):
        super().__init__(message, code=409)


# ═══════════════════════════════════════════════════════════════════════════
# Auth
# ═══════════════════════════════════════════════════════════════════════════


class BackendAuth(ABC):
    """Auth provider for a backend instance."""
    
    @abstractmethod
    async def validate(self) -> bool:
        """Verify the backend is accessible with current credentials."""
        ...
    
    @abstractmethod
    async def refresh(self) -> str:
        """Return a valid auth token (API key, Bearer token, etc.)."""
        ...
    
    @abstractmethod
    async def is_expired(self) -> bool:
        """Check if credentials need refreshing."""
        ...


# ═══════════════════════════════════════════════════════════════════════════
# Core Protocol
# ═══════════════════════════════════════════════════════════════════════════


class BackendProtocol(ABC):
    """Abstract backend — all transports implement this interface."""
    
    # ── Health ─────────────────────────────────────────────────────────────
    
    @abstractmethod
    async def health(self) -> dict[str, Any]:
        """Get backend health status.
        
        Returns:
            {"status": "ok", "version": "3.5.0", ...}
        
        Raises:
            BackendError: Backend unreachable or unhealthy.
        """
        ...
    
    # ── Sessions ───────────────────────────────────────────────────────────
    
    @abstractmethod
    async def list_sessions(self) -> list[Session]:
        """List all sessions.
        
        Returns:
            List of Session objects, empty if none exist.
        
        Raises:
            BackendError: Backend error or unreachable.
        """
        ...
    
    @abstractmethod
    async def create_session(
        self,
        port: str,
        paradigm: Optional[str] = None
    ) -> Session:
        """Create a new session.
        
        Args:
            port: Serial port (e.g., "/dev/ttyUSB0")
            paradigm: Optional paradigm name (e.g., "fr")
        
        Returns:
            New Session object with generated ID.
        
        Raises:
            BackendError: Invalid port, paradigm not found, etc.
        """
        ...
    
    @abstractmethod
    async def get_session(self, session_id: str) -> Session:
        """Get a single session by ID.
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def destroy_session(self, session_id: str) -> None:
        """Delete a session.
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def reset_session(self, session_id: str) -> Session:
        """Reset session state (reconnect serial, clear buffers, etc.).
        
        Returns:
            Updated Session object.
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    # ── Firmware ───────────────────────────────────────────────────────────
    
    @abstractmethod
    async def list_boards(self) -> list[FirmwareBoard]:
        """List available Arduino boards and their paradigms.
        
        Returns:
            [FirmwareBoard(board="uno", paradigms=["fr", "pr", ...]), ...]
        
        Raises:
            BackendError: Could not enumerate boards.
        """
        ...
    
    @abstractmethod
    async def list_paradigms(self, board: Optional[str] = None) -> list[str]:
        """List available paradigms, optionally filtered by board.
        
        Args:
            board: Optional board name filter (e.g., "mega").
        
        Returns:
            List of paradigm names.
        
        Raises:
            BackendError: Invalid board, etc.
        """
        ...
    
    @abstractmethod
    async def upload_firmware(
        self,
        session_id: str,
        paradigm: str,
        board: str = "uno",
        hex_data: Optional[str] = None
    ) -> dict[str, Any]:
        """Upload firmware to an Arduino.
        
        Args:
            session_id: Session to upload firmware for.
            paradigm: Paradigm name (e.g., "fr").
            board: Board type (default "uno").
            hex_data: Optional Intel hex data; if None, use bundled hex.
        
        Returns:
            {"status": "ok", "uploaded_at": "2026-09-23T...", ...}
        
        Raises:
            SessionNotFoundError: Session does not exist.
            BackendError: Firmware not found, upload failed, etc.
        """
        ...
    
    # ── Hardware Config ────────────────────────────────────────────────────
    
    @abstractmethod
    async def get_config(self, session_id: str) -> HardwareConfig:
        """Get hardware configuration for a session.
        
        Returns:
            HardwareConfig with board-specific state (frequencies, timeouts, etc.).
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def set_config(
        self,
        session_id: str,
        key: str,
        value: Any
    ) -> HardwareConfig:
        """Set a hardware configuration value.
        
        Args:
            session_id: Target session.
            key: Config key (e.g., "primary_cue_freq_hz").
            value: New value.
        
        Returns:
            Updated HardwareConfig.
        
        Raises:
            SessionNotFoundError: Session does not exist.
            BackendError: Invalid config key or value.
        """
        ...
    
    # ── Hardware Commands ──────────────────────────────────────────────────
    
    @abstractmethod
    async def send_command(
        self,
        session_id: str,
        code: int,
        value: Optional[int] = None
    ) -> dict[str, Any]:
        """Send a command code to the Arduino.
        
        Args:
            session_id: Target session.
            code: Command code (e.g., 101 for START_SESSION).
            value: Optional parameter value.
        
        Returns:
            {"status": "ok", "code": 101, ...}
        
        Raises:
            SessionNotFoundError: Session does not exist.
            BackendError: Serial I/O error, invalid command, etc.
        """
        ...
    
    @abstractmethod
    async def get_commands(self, session_id: str) -> dict[int, str]:
        """Get available command codes and their descriptions.
        
        Returns:
            {101: "START_SESSION", 102: "STOP_SESSION", ...}
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    # ── Program Control ────────────────────────────────────────────────────
    
    @abstractmethod
    async def start_program(self, session_id: str) -> Session:
        """Start a running session.
        
        Returns:
            Updated Session with state=RUNNING.
        
        Raises:
            SessionNotFoundError: Session does not exist.
            ConflictError: Session not in CONNECTED state.
        """
        ...
    
    @abstractmethod
    async def stop_program(self, session_id: str) -> Session:
        """Stop a running session.
        
        Returns:
            Updated Session with state=STOPPED.
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def pause_program(self, session_id: str) -> Session:
        """Pause a running session.
        
        Returns:
            Updated Session with state=PAUSED.
        
        Raises:
            SessionNotFoundError: Session does not exist.
            ConflictError: Session not in RUNNING state.
        """
        ...
    
    @abstractmethod
    async def arm_external_trigger(self, session_id: str) -> Session:
        """Arm external trigger (hold session until TTL edge).
        
        Returns:
            Updated Session with state=ARMED.
        
        Raises:
            SessionNotFoundError: Session does not exist.
            ConflictError: Session not in CONNECTED state.
        """
        ...
    
    @abstractmethod
    async def disarm_external_trigger(self, session_id: str) -> Session:
        """Disarm external trigger (cancel armed state).
        
        Returns:
            Updated Session with state=CONNECTED.
        
        Raises:
            SessionNotFoundError: Session does not exist.
            ConflictError: Session not in ARMED state.
        """
        ...
    
    @abstractmethod
    async def restart_program(self, session_id: str) -> Session:
        """Restart a stopped/paused session.
        
        Returns:
            Updated Session with state=RUNNING.
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def split_segment(self, session_id: str) -> dict[str, Any]:
        """Mark a segment boundary during a running session.
        
        Returns:
            {"segment_index": 1, "timestamp": "2026-09-23T...", ...}
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def set_limit(
        self,
        session_id: str,
        limit_type: str,
        **params
    ) -> dict[str, Any]:
        """Set a session limit (e.g., max trials, timeout).
        
        Args:
            session_id: Target session.
            limit_type: Limit type (e.g., "trial_count", "duration_sec").
            **params: Type-specific parameters.
        
        Returns:
            {"status": "ok", "limit_type": "trial_count", ...}
        
        Raises:
            SessionNotFoundError: Session does not exist.
            BackendError: Invalid limit type or params.
        """
        ...
    
    # ── Data Export ────────────────────────────────────────────────────────
    
    @abstractmethod
    async def get_behavior(
        self,
        session_id: str,
        since: Optional[int] = None
    ) -> dict[str, Any]:
        """Get behavior events for a session.
        
        Args:
            session_id: Target session.
            since: Optional timestamp (unix ms); only return events after this.
        
        Returns:
            {
                "events": [
                    {"type": "press", "lever": "rh", "timestamp": 123456, ...},
                    ...
                ]
            }
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def get_frames(self, session_id: str) -> dict[str, Any]:
        """Get imaging frame metadata for a session.
        
        Returns:
            {"frames": [{"id": 0, "timestamp": 123456, ...}, ...]}
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    @abstractmethod
    async def export_zip(
        self,
        session_id: str,
        **options
    ) -> dict[str, Any]:
        """Export session data as a ZIP file.
        
        Args:
            session_id: Target session.
            **options: Export options (e.g., include_raw=True).
        
        Returns:
            {"url": "/file/{session_id}/download/xyz.zip", "size_bytes": 12345}
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    # ── Subscriptions ──────────────────────────────────────────────────────
    
    @abstractmethod
    async def subscribe_behavior_events(
        self,
        session_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Subscribe to behavior events for a session (real-time).
        
        Yields:
            Each behavior event as it arrives:
            {"type": "press", "lever": "rh", "timestamp": 123456, ...}
        
        Raises:
            SessionNotFoundError: Session does not exist.
            BackendError: Connection lost, etc.
        """
        ...
    
    @abstractmethod
    async def subscribe_frames(
        self,
        session_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Subscribe to imaging frame events for a session (real-time).
        
        Yields:
            Each frame metadata as it arrives.
        
        Raises:
            SessionNotFoundError: Session does not exist.
        """
        ...
    
    # ── Lifecycle ──────────────────────────────────────────────────────────
    
    @abstractmethod
    async def shutdown(self) -> None:
        """Gracefully shut down the backend.
        
        Used by the server's /shutdown endpoint and during cleanup.
        """
        ...
    
    @abstractmethod
    async def close(self) -> None:
        """Close the backend connection (if applicable).
        
        For HTTP clients, closes the underlying httpx client.
        For in-process, a no-op or cleanup only.
        """
        ...


__all__ = [
    "BackendProtocol",
    "BackendAuth",
    "BackendError",
    "SessionNotFoundError",
    "UnauthorizedError",
    "ConflictError",
    "Session",
    "SessionState",
    "FirmwareBoard",
    "HardwareConfig",
]
```

---

## File 2: `reacher/backend/rest_binding.py`

**Purpose**: HTTP transport implementation of `BackendProtocol`.

```python
"""HTTP REST client that implements BackendProtocol."""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Optional

import httpx
import websockets

from .protocol import (
    BackendProtocol,
    BackendAuth,
    BackendError,
    SessionNotFoundError,
    UnauthorizedError,
    ConflictError,
    Session,
    SessionState,
    FirmwareBoard,
    HardwareConfig,
)


class HTTPBackendAuth(BackendAuth):
    """Simple Bearer token auth."""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
    
    async def validate(self) -> bool:
        """Check if the backend is reachable."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/health",
                    timeout=5.0
                )
                return resp.status_code == 200
        except Exception:
            return False
    
    async def refresh(self) -> str:
        """Return the current API key."""
        return self.api_key or ""
    
    async def is_expired(self) -> bool:
        """API keys don't expire (for now)."""
        return False


class RESTBackend(BackendProtocol):
    """HTTP REST transport to a remote or local REACHER server."""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        """Initialize a REST backend.
        
        Args:
            base_url: Server URL (e.g., "http://localhost:6229").
            api_key: Optional API key; if None, unauthenticated requests.
        """
        self.base_url = base_url.rstrip("/")
        self.auth = HTTPBackendAuth(base_url, api_key)
        
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=30.0,
        )
    
    async def _req(
        self,
        method: str,
        path: str,
        json_body: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Make an HTTP request and return JSON response.
        
        Raises:
            BackendError: HTTP error or network failure.
        """
        try:
            resp = await self._http.request(
                method,
                path,
                json=json_body,
                params=params,
            )
        except httpx.RequestError as exc:
            raise BackendError(f"Network error: {exc}", code=500)
        
        # Handle HTTP errors
        if resp.status_code == 401:
            raise UnauthorizedError()
        elif resp.status_code == 404:
            # Body might indicate which session was not found
            data = resp.json() if resp.text else {}
            msg = data.get("message", "Not found")
            raise BackendError(msg, code=404)
        elif resp.status_code == 409:
            data = resp.json() if resp.text else {}
            msg = data.get("message", "Conflict")
            raise ConflictError(msg)
        elif resp.status_code >= 400:
            data = resp.json() if resp.text else {}
            msg = data.get("message", f"HTTP {resp.status_code}")
            raise BackendError(msg, code=resp.status_code)
        
        return resp.json() if resp.text else {}
    
    # ── Health ─────────────────────────────────────────────────────────────
    
    async def health(self) -> dict[str, Any]:
        return await self._req("GET", "/health")
    
    # ── Sessions ───────────────────────────────────────────────────────────
    
    async def list_sessions(self) -> list[Session]:
        data = await self._req("GET", "/api/sessions")
        sessions = data.get("sessions", [])
        return [Session.model_validate(s) for s in sessions]
    
    async def create_session(
        self,
        port: str,
        paradigm: Optional[str] = None
    ) -> Session:
        body = {"port": port}
        if paradigm:
            body["paradigm"] = paradigm
        data = await self._req("POST", "/api/sessions", json_body=body)
        return Session.model_validate(data)
    
    async def get_session(self, session_id: str) -> Session:
        data = await self._req("GET", f"/api/sessions/{session_id}")
        return Session.model_validate(data)
    
    async def destroy_session(self, session_id: str) -> None:
        await self._req("DELETE", f"/api/sessions/{session_id}")
    
    async def reset_session(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/sessions/{session_id}/reset")
        return Session.model_validate(data)
    
    # ── Firmware ───────────────────────────────────────────────────────────
    
    async def list_boards(self) -> list[FirmwareBoard]:
        data = await self._req("GET", "/api/firmware/boards")
        boards = data.get("boards", [])
        return [
            FirmwareBoard(
                board=b.get("board"),
                paradigms=b.get("paradigms", [])
            )
            for b in boards
        ]
    
    async def list_paradigms(self, board: Optional[str] = None) -> list[str]:
        params = {"board": board} if board else {}
        data = await self._req("GET", "/api/firmware/paradigms", params=params)
        return data.get("paradigms", [])
    
    async def upload_firmware(
        self,
        session_id: str,
        paradigm: str,
        board: str = "uno",
        hex_data: Optional[str] = None
    ) -> dict[str, Any]:
        body = {"paradigm": paradigm, "board": board}
        if hex_data:
            body["hex_data"] = hex_data
        return await self._req(
            "POST",
            f"/api/firmware/upload/{session_id}",
            json_body=body
        )
    
    # ── Hardware Config ────────────────────────────────────────────────────
    
    async def get_config(self, session_id: str) -> HardwareConfig:
        data = await self._req("GET", f"/api/hardware/{session_id}/config")
        return HardwareConfig(
            session_id=session_id,
            config=data.get("config", {})
        )
    
    async def set_config(
        self,
        session_id: str,
        key: str,
        value: Any
    ) -> HardwareConfig:
        body = {"key": key, "value": value}
        data = await self._req(
            "POST",
            f"/api/hardware/{session_id}/config",
            json_body=body
        )
        return HardwareConfig(
            session_id=session_id,
            config=data.get("config", {})
        )
    
    # ── Hardware Commands ──────────────────────────────────────────────────
    
    async def send_command(
        self,
        session_id: str,
        code: int,
        value: Optional[int] = None
    ) -> dict[str, Any]:
        body = {"code": code}
        if value is not None:
            body["value"] = value
        return await self._req(
            "POST",
            f"/api/hardware/{session_id}/command",
            json_body=body
        )
    
    async def get_commands(self, session_id: str) -> dict[int, str]:
        data = await self._req("GET", f"/api/hardware/{session_id}/commands")
        # Expect: {"commands": {101: "START_SESSION", ...}}
        return data.get("commands", {})
    
    # ── Program Control ────────────────────────────────────────────────────
    
    async def start_program(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/program/{session_id}/start")
        return Session.model_validate(data)
    
    async def stop_program(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/program/{session_id}/stop")
        return Session.model_validate(data)
    
    async def pause_program(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/program/{session_id}/pause")
        return Session.model_validate(data)
    
    async def arm_external_trigger(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/program/{session_id}/arm-trigger")
        return Session.model_validate(data)
    
    async def disarm_external_trigger(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/program/{session_id}/disarm-trigger")
        return Session.model_validate(data)
    
    async def restart_program(self, session_id: str) -> Session:
        data = await self._req("POST", f"/api/program/{session_id}/restart")
        return Session.model_validate(data)
    
    async def split_segment(self, session_id: str) -> dict[str, Any]:
        return await self._req("POST", f"/api/program/{session_id}/split")
    
    async def set_limit(
        self,
        session_id: str,
        limit_type: str,
        **params
    ) -> dict[str, Any]:
        body = {"type": limit_type, **params}
        return await self._req(
            "POST",
            f"/api/program/{session_id}/limit",
            json_body=body
        )
    
    # ── Data Export ────────────────────────────────────────────────────────
    
    async def get_behavior(
        self,
        session_id: str,
        since: Optional[int] = None
    ) -> dict[str, Any]:
        params = {"since": since} if since is not None else {}
        return await self._req(
            "GET",
            f"/api/data/{session_id}/behavior",
            params=params
        )
    
    async def get_frames(self, session_id: str) -> dict[str, Any]:
        return await self._req("GET", f"/api/data/{session_id}/frames")
    
    async def export_zip(
        self,
        session_id: str,
        **options
    ) -> dict[str, Any]:
        return await self._req(
            "POST",
            f"/api/file/{session_id}/export/zip",
            json_body=options
        )
    
    # ── Subscriptions ──────────────────────────────────────────────────────
    
    async def subscribe_behavior_events(
        self,
        session_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Subscribe to behavior events via WebSocket."""
        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        api_key = self.auth.api_key or ""
        
        try:
            async with websockets.connect(
                f"{ws_url}/ws?token={api_key}"
            ) as ws:
                # Subscribe to this session
                await ws.send(json.dumps({
                    "action": "subscribe",
                    "session_id": session_id
                }))
                
                # Yield events until connection closes
                async for msg in ws:
                    try:
                        event = json.loads(msg)
                        yield event
                    except json.JSONDecodeError:
                        continue
        except websockets.exceptions.WebSocketException as exc:
            raise BackendError(f"WebSocket error: {exc}", code=500)
    
    async def subscribe_frames(
        self,
        session_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Subscribe to frame events via WebSocket."""
        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        api_key = self.auth.api_key or ""
        
        try:
            async with websockets.connect(
                f"{ws_url}/ws?token={api_key}"
            ) as ws:
                await ws.send(json.dumps({
                    "action": "subscribe_frames",
                    "session_id": session_id
                }))
                
                async for msg in ws:
                    try:
                        event = json.loads(msg)
                        yield event
                    except json.JSONDecodeError:
                        continue
        except websockets.exceptions.WebSocketException as exc:
            raise BackendError(f"WebSocket error: {exc}", code=500)
    
    # ── Lifecycle ──────────────────────────────────────────────────────────
    
    async def shutdown(self) -> None:
        await self._req("POST", "/api/lifecycle/shutdown")
    
    async def close(self) -> None:
        await self._http.aclose()


__all__ = ["RESTBackend", "HTTPBackendAuth"]
```

---

## File 3: `reacher/backend/in_process.py`

**Purpose**: Direct (in-process) backend for testing and RPi standalone.

```python
"""In-process backend — direct method calls, no HTTP transport."""

from __future__ import annotations

from typing import Any, AsyncIterator, Optional

from .protocol import (
    BackendProtocol,
    BackendAuth,
    BackendError,
    SessionNotFoundError,
    Session,
    SessionState,
    FirmwareBoard,
    HardwareConfig,
)


class NoopAuth(BackendAuth):
    """Auth that always validates (for in-process use)."""
    
    async def validate(self) -> bool:
        return True
    
    async def refresh(self) -> str:
        return ""
    
    async def is_expired(self) -> bool:
        return False


class InProcessBackend(BackendProtocol):
    """Direct access backend — calls session/firmware logic directly.
    
    Used for testing (no HTTP overhead) and RPi standalone deployment.
    """
    
    def __init__(self, session_manager: Any, firmware_registry: Any):
        """Initialize an in-process backend.
        
        Args:
            session_manager: SessionManager instance.
            firmware_registry: FirmwareRegistry instance.
        """
        self.sessions = session_manager
        self.firmware = firmware_registry
        self.auth = NoopAuth()
    
    # ── Health ─────────────────────────────────────────────────────────────
    
    async def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "mode": "in-process",
            "sessions_count": len(self.sessions.list()),
        }
    
    # ── Sessions ───────────────────────────────────────────────────────────
    
    async def list_sessions(self) -> list[Session]:
        return self.sessions.list()
    
    async def create_session(
        self,
        port: str,
        paradigm: Optional[str] = None
    ) -> Session:
        return self.sessions.create(port=port, paradigm=paradigm)
    
    async def get_session(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        return session
    
    async def destroy_session(self, session_id: str) -> None:
        if not self.sessions.delete(session_id):
            raise SessionNotFoundError(session_id)
    
    async def reset_session(self, session_id: str) -> Session:
        session = self.sessions.reset(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        return session
    
    # ── Firmware ───────────────────────────────────────────────────────────
    
    async def list_boards(self) -> list[FirmwareBoard]:
        return self.firmware.list_boards()
    
    async def list_paradigms(self, board: Optional[str] = None) -> list[str]:
        return self.firmware.list_paradigms(board)
    
    async def upload_firmware(
        self,
        session_id: str,
        paradigm: str,
        board: str = "uno",
        hex_data: Optional[str] = None
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        # Get hex data (built-in or provided)
        if not hex_data:
            hex_data = self.firmware.get_hex(board, paradigm)
            if not hex_data:
                raise BackendError(
                    f"Firmware not found for {board}/{paradigm}",
                    code=404
                )
        
        # Upload to Arduino on this session's port
        result = self.sessions.upload_firmware(session_id, hex_data)
        return {
            "status": "ok",
            "uploaded_at": result.get("timestamp", ""),
            "bytes": len(hex_data)
        }
    
    # ── Hardware Config ────────────────────────────────────────────────────
    
    async def get_config(self, session_id: str) -> HardwareConfig:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        config = session.get_config()
        return HardwareConfig(session_id=session_id, config=config)
    
    async def set_config(
        self,
        session_id: str,
        key: str,
        value: Any
    ) -> HardwareConfig:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.set_config(key, value)
        config = session.get_config()
        return HardwareConfig(session_id=session_id, config=config)
    
    # ── Hardware Commands ──────────────────────────────────────────────────
    
    async def send_command(
        self,
        session_id: str,
        code: int,
        value: Optional[int] = None
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        result = session.send_command(code, value)
        return {"status": "ok", "code": code, **result}
    
    async def get_commands(self, session_id: str) -> dict[int, str]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        return session.get_commands()
    
    # ── Program Control ────────────────────────────────────────────────────
    
    async def start_program(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        if session.state != SessionState.CONNECTED:
            raise BackendError(
                f"Cannot start session in {session.state} state",
                code=409
            )
        
        session.start()
        return session
    
    async def stop_program(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.stop()
        return session
    
    async def pause_program(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.pause()
        return session
    
    async def arm_external_trigger(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.arm_trigger()
        return session
    
    async def disarm_external_trigger(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.disarm_trigger()
        return session
    
    async def restart_program(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.restart()
        return session
    
    async def split_segment(self, session_id: str) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        result = session.split_segment()
        return {"segment_index": result}
    
    async def set_limit(
        self,
        session_id: str,
        limit_type: str,
        **params
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        session.set_limit(limit_type, **params)
        return {"status": "ok", "limit_type": limit_type}
    
    # ── Data Export ────────────────────────────────────────────────────────
    
    async def get_behavior(
        self,
        session_id: str,
        since: Optional[int] = None
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        events = session.get_behavior_events(since=since)
        return {"events": events}
    
    async def get_frames(self, session_id: str) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        frames = session.get_frames()
        return {"frames": frames}
    
    async def export_zip(
        self,
        session_id: str,
        **options
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        zip_path = session.export_zip(**options)
        return {"url": f"/file/{session_id}/download/{zip_path}", "size_bytes": 0}
    
    # ── Subscriptions ──────────────────────────────────────────────────────
    
    async def subscribe_behavior_events(
        self,
        session_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """In-process subscription — yield events from internal queue."""
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        # Get event subscription from session
        queue = session.get_event_queue()
        while True:
            event = await queue.get()
            if event is None:  # End of stream marker
                break
            yield event
    
    async def subscribe_frames(
        self,
        session_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """In-process frame subscription."""
        session = self.sessions.get(session_id)
        if not session:
            raise SessionNotFoundError(session_id)
        
        queue = session.get_frame_queue()
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event
    
    # ── Lifecycle ──────────────────────────────────────────────────────────
    
    async def shutdown(self) -> None:
        """Shutdown the backend gracefully."""
        self.sessions.shutdown()
    
    async def close(self) -> None:
        """Close connections (if any)."""
        await self.shutdown()


__all__ = ["InProcessBackend", "NoopAuth"]
```

---

## File 4: `reacher/backend/__init__.py`

```python
"""Backend protocol and bindings — unified interface for all transports."""

from .protocol import (
    BackendProtocol,
    BackendAuth,
    BackendError,
    SessionNotFoundError,
    UnauthorizedError,
    ConflictError,
    Session,
    SessionState,
    FirmwareBoard,
    HardwareConfig,
)

from .rest_binding import RESTBackend, HTTPBackendAuth
from .in_process import InProcessBackend, NoopAuth

__version__ = "3.5.0"

__all__ = [
    "BackendProtocol",
    "BackendAuth",
    "BackendError",
    "SessionNotFoundError",
    "UnauthorizedError",
    "ConflictError",
    "Session",
    "SessionState",
    "FirmwareBoard",
    "HardwareConfig",
    "RESTBackend",
    "HTTPBackendAuth",
    "InProcessBackend",
    "NoopAuth",
]
```

---

## File 5: Test Example (`reacher/backend/tests/test_rest_binding.py`)

```python
"""Unit tests for RESTBackend (no live backend needed)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from reacher.backend.rest_binding import RESTBackend
from reacher.backend.protocol import SessionNotFoundError, UnauthorizedError


@pytest.mark.asyncio
async def test_health():
    """Test health check."""
    backend = RESTBackend("http://localhost:6229", api_key="test-key")
    
    with patch.object(backend._http, 'request') as mock_req:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "ok"}
        mock_req.return_value = mock_resp
        
        result = await backend.health()
        assert result["status"] == "ok"
    
    await backend.close()


@pytest.mark.asyncio
async def test_list_sessions():
    """Test listing sessions."""
    backend = RESTBackend("http://localhost:6229", api_key="test-key")
    
    with patch.object(backend._http, 'request') as mock_req:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "sessions": [
                {"id": "sess1", "port": "/dev/ttyUSB0", "state": "connected"},
                {"id": "sess2", "port": "/dev/ttyUSB1", "state": "running"},
            ]
        }
        mock_req.return_value = mock_resp
        
        sessions = await backend.list_sessions()
        assert len(sessions) == 2
        assert sessions[0].id == "sess1"
    
    await backend.close()


@pytest.mark.asyncio
async def test_unauthorized():
    """Test 401 response."""
    backend = RESTBackend("http://localhost:6229", api_key="bad-key")
    
    with patch.object(backend._http, 'request') as mock_req:
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_req.return_value = mock_resp
        
        with pytest.raises(UnauthorizedError):
            await backend.health()
    
    await backend.close()
```

---

## Phase 0 Checklist

- [ ] `reacher/backend/protocol.py` — all 30+ methods, zero internal imports
- [ ] `reacher/backend/rest_binding.py` — HTTP implementation, full coverage
- [ ] `reacher/backend/in_process.py` — direct access backend
- [ ] `reacher/backend/__init__.py` — public exports
- [ ] Unit tests for each binding (at least 10 tests each)
- [ ] mypy strict mode passes
- [ ] Update `pyproject.toml` to expose `reacher.backend` module
- [ ] Updated `reacher/firmware/resolver.py` (if needed)
- [ ] CI passes on Python 3.10+
- [ ] Documentation: `docs/BACKEND_ARCHITECTURE.md` (summarized from main spec)

---

## Success Criteria

✓ All three binding modules are importable  
✓ mypy strict mode passes (zero errors)  
✓ Protocol interface fully documented with docstrings  
✓ Tests pass for all bindings (no live backend required)  
✓ Existing `reacher` API endpoints continue to work (no changes)  
✓ No breaking changes to public APIs  
✓ Both `labrynth` and `reacher` can be installed together  

---

**Estimated Effort**: 40–60 hours (2 developers × 1 week)  
**Risk**: Low (additive, no existing code changed)  
**Rollback**: Delete `reacher/backend/`, revert resolver changes
