# Backend Unification Strategy: Labrynth Architecture Assessment

**Status**: Technical specification for architecture review  
**Audience**: Fable-tier lead (architecture), Opus-tier frontend specialist (deployment/testing)  
**Date**: 2026-09-23  
**Author**: Backend Analysis Subagent

---

## Executive Summary

This document assesses a unified backend architecture that can:
- Serve GUI (Labrynth) and CLI (LabrynthCLI) without code duplication
- Handle multi-machine proxy mode transparently
- Deploy standalone on RPi or embedded in desktop applications
- Maintain clean dependency trees and firmware hex resolution
- Execute with clear deprecation phases and rollback guarantees

**Current State**: Labrynth is an application shell; `reacher` is the external backend pip package that ships firmware hex. Both GUI and CLI independently call the same REST API endpoints, creating maintenance friction and test gaps.

**Proposed Direction**: Move toward a **unified internal backend abstraction** that underlies both surfaces, with the reacher REST API as one *protocol binding* rather than the only path.

---

## Part 1: Unified API Layer Design

### Current State

**CLI** (`cli/client.py`):
- `ReacherClient`: thin async httpx wrapper
- ~20 methods mapping 1:1 to REST endpoints (`/api/sessions`, `/api/firmware/upload`, `/api/program/{id}/start`, etc.)
- Reads API key from `~/.reacher/api_key` or `REACHER_API_KEY`
- Used by `cli/app.py` (prompt_toolkit TUI)

**Frontend** (`web/src/api/client.ts`):
- `MachineApiClient`: ES6 class, parallel REST + WebSocket calls
- ~30 methods + `ReacherWebSocket` for subscriptions
- Proxy mode: routes `/api/proxy/{deviceId}/...` through local REACHER server
- Stores API keys in `localStorage` (browser model)
- Session recovery and multi-machine discovery via mDNS

**Decoupling Problem**:
- Both re-implement auth (Bearer token header for HTTP, `?token=` for WS)
- No shared schema validation or error handling
- CLI tests would need to mock both the `ReacherClient` calls *and* the live backend API
- New endpoints require changes in two places; field renames break both

### Proposed Architecture: Backend Abstraction Layer

Introduce a **backend protocol** that abstracts the transport and focuses on data flow:

```
┌─────────────────────────────────────────────────────────────┐
│                   Unified Backend Interface                  │
│  (Protocol-agnostic methods: list_sessions, start_program...) │
└──────────┬──────────────────────────────────────────────────┘
           │
     ┌─────┴──────────────────┬──────────────────┬─────────────┐
     │                        │                  │             │
  [REST Binding]        [WebSocket Binding]  [In-Process]   [gRPC]
  (production)          (for subscriptions)  (testing/RPi)  (future)
     │                        │                  │             │
┌────┴────────────┐   ┌──────┴────────┐   ┌───┴──────┐   ┌──┴─────┐
│ reacher HTTP    │   │ ReacherWS     │   │Backend   │   │ gRPC   │
│ (FastAPI)       │   │ (Starlette)   │   │ (direct) │   │ server │
└─────────────────┘   └───────────────┘   └──────────┘   └────────┘
```

**Step 1: Define the Backend Interface** (Python, reacher repo)

Create `reacher/backend/protocol.py`:

```python
"""Abstract backend protocol — all surfaces communicate through this."""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import AsyncIterator
from dataclasses import dataclass

@dataclass
class Session:
    """Unified session model."""
    id: str
    port: str
    paradigm: str | None
    state: str  # idle | uploading | connected | running | paused | stopped

@dataclass
class FirmwareBoard:
    board: str
    paradigms: list[str]

class BackendError(Exception):
    """All backend methods raise this + subclasses for uniform error handling."""
    code: int  # HTTP-like: 400, 401, 409, 500, etc.

class BackendAuth(ABC):
    """Auth provider abstraction — REST Bearer, WebSocket token, or in-process."""
    @abstractmethod
    async def validate(self) -> bool: ...
    @abstractmethod
    async def refresh(self) -> str: ...

class BackendProtocol(ABC):
    """Abstract backend — all transports implement this."""

    @abstractmethod
    async def health(self) -> dict: ...

    # Sessions
    @abstractmethod
    async def list_sessions(self) -> list[Session]: ...
    
    @abstractmethod
    async def create_session(self, port: str, paradigm: str | None = None) -> Session: ...
    
    @abstractmethod
    async def destroy_session(self, session_id: str) -> None: ...

    # Firmware
    @abstractmethod
    async def list_boards(self) -> list[FirmwareBoard]: ...
    
    @abstractmethod
    async def upload_firmware(
        self, 
        session_id: str, 
        paradigm: str, 
        board: str = "uno",
        hex_data: str | None = None
    ) -> dict: ...

    # Program control
    @abstractmethod
    async def start_program(self, session_id: str) -> dict: ...
    
    @abstractmethod
    async def stop_program(self, session_id: str) -> dict: ...

    # (... ~30 more methods ...)

    # Subscriptions — yield events as they arrive
    @abstractmethod
    async def subscribe_behavior_events(
        self, 
        session_id: str
    ) -> AsyncIterator[dict]:
        """Yield behavior events for a session until unsubscribed or error."""
        ...
```

**Step 2: REST Binding Implementation** (reacher repo)

Create `reacher/backend/rest_binding.py`:

```python
"""HTTP REST client that implements BackendProtocol."""

import httpx
from .protocol import BackendProtocol, BackendError, Session, BackendAuth

class HTTPBackendAuth(BackendAuth):
    def __init__(self, base_url: str, api_key: str | None = None):
        self.base_url = base_url
        self.api_key = api_key
    
    async def validate(self) -> bool:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.base_url}/health")
            return resp.status_code == 200
    
    async def refresh(self) -> str:
        return self.api_key

class RESTBackend(BackendProtocol):
    """HTTP REST transport — talks to a running reacher server."""
    
    def __init__(self, base_url: str, api_key: str | None = None):
        self.base_url = base_url
        self.auth = HTTPBackendAuth(base_url, api_key)
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=30.0
        )
    
    async def health(self) -> dict:
        r = await self._http.get("/health")
        r.raise_for_status()
        return r.json()
    
    async def list_sessions(self) -> list[Session]:
        r = await self._http.get("/api/sessions")
        r.raise_for_status()
        data = r.json()
        return [Session(**s) for s in data.get("sessions", [])]
    
    # (... implementation mirrors reacher.api endpoints ...)
    
    async def subscribe_behavior_events(self, session_id: str):
        """WebSocket subscription for behavior events."""
        token = self.api_key or ""
        async with websockets.connect(
            f"{self.base_url.replace('http', 'ws')}/ws?token={token}"
        ) as ws:
            await ws.send(json.dumps({"session_id": session_id}))
            async for msg in ws:
                yield json.loads(msg)
```

**Step 3: In-Process Binding** (for testing + standalone RPi deployment)

Create `reacher/backend/in_process.py`:

```python
"""In-process backend — direct access to session managers, no HTTP."""

from .protocol import BackendProtocol, Session
from reacher.session import SessionManager
from reacher.firmware import FirmwareRegistry

class InProcessBackend(BackendProtocol):
    """Direct access backend for embedded use (tests, RPi standalone)."""
    
    def __init__(self, session_manager: SessionManager, firmware_registry: FirmwareRegistry):
        self.sessions = session_manager
        self.firmware = firmware_registry
    
    async def list_sessions(self) -> list[Session]:
        return self.sessions.list()
    
    async def create_session(self, port: str, paradigm: str | None = None) -> Session:
        return self.sessions.create(port=port, paradigm=paradigm)
    
    # Direct method calls — no serialization overhead
```

### Integration Points

**In CLI** (`cli/client.py` → `backend/rpc.py`):

```python
from reacher.backend.protocol import BackendProtocol

class CliBackend:
    """Adapter for CLI to use BackendProtocol."""
    
    def __init__(self, backend: BackendProtocol):
        self.backend = backend
    
    async def list_sessions(self):
        sessions = await self.backend.list_sessions()
        return [s.model_dump() for s in sessions]  # JSON-safe
```

**In Frontend** (`web/src/api/client.ts` → new `backend-adapter.ts`):

```typescript
export class UnifiedBackendAdapter implements BackendProtocol {
  constructor(
    private restClient: MachineApiClient,
    private wsClient: ReacherWebSocket
  ) {}

  async listSessions(): Promise<Session[]> {
    const resp = await this.restClient.request("GET", "/api/sessions");
    return resp.sessions || [];
  }

  async *subscribeBehaviorEvents(sessionId: string): AsyncIterableIterator<BehaviorEvent> {
    yield* this.wsClient.subscribe(sessionId);
  }
}
```

### Benefits

| Aspect | Current | Unified |
|--------|---------|---------|
| **Code location** | CLI + Frontend + reacher (3 places) | 1 place (BackendProtocol) |
| **API changes** | Update interface, add CLI method, add TS method | Change protocol + bindings auto-follow |
| **Error handling** | Re-implemented in both clients | Centralized in BackendError hierarchy |
| **Schema validation** | Manual in both | Optional: single Pydantic model |
| **Testing** | Mock both HTTP + WS | Mock one BackendProtocol |

---

## Part 2: Multi-Machine & Proxy Mode

### Current Architecture

Frontend holds `useMachineStore`:
- **Local mode**: browser owns API key, calls `http://localhost:6229/api/...` directly
- **Proxy mode**: browser sends to `/api/proxy/{deviceId}/...` on local REACHER, which:
  - Holds the remote API key server-side
  - Forwards the request to remote REACHER at `http://<remote-ip>:6229/...`
  - Returns response to browser

**Problem**: The proxy logic lives in the reacher backend; if you want to compose requests across multiple machines (e.g., "start session on Machine A, wait for event on Machine B"), the frontend must orchestrate it via separate calls.

### Unified Proxy Pattern

Extend `BackendProtocol` with a **machine-aware wrapper**:

```python
from reacher.backend.protocol import BackendProtocol

@dataclass
class Machine:
    """A REACHER instance (local or remote)."""
    id: str  # unique identifier (hostname, serial, UUID)
    name: str
    address: str  # http://localhost:6229 or http://10.0.1.5:6229
    api_key: str | None  # None for local (browser has it), set for remote
    mode: str  # "local" | "remote" | "proxy"
    is_local: bool = False

class MachineAwareBackend(BackendProtocol):
    """Multi-machine backend — routes calls to the right machine."""
    
    def __init__(self, machines: dict[str, Machine], local_backend: BackendProtocol):
        self.machines = machines
        self.local = local_backend  # Local machine's backend (proxy host)
    
    def _get_backend(self, machine_id: str) -> BackendProtocol:
        """Get the backend for a machine — REST or in-process."""
        machine = self.machines.get(machine_id)
        if not machine:
            raise BackendError(f"Machine {machine_id} not found", 404)
        
        if machine.is_local:
            return self.local
        
        # Remote: create REST binding with machine's API key
        from reacher.backend.rest_binding import RESTBackend
        return RESTBackend(machine.address, api_key=machine.api_key)
    
    async def list_sessions(self, machine_id: str = "local") -> list[Session]:
        backend = self._get_backend(machine_id)
        return await backend.list_sessions()
    
    async def create_session(
        self,
        machine_id: str,
        port: str,
        paradigm: str | None = None
    ) -> Session:
        backend = self._get_backend(machine_id)
        session = await backend.create_session(port, paradigm)
        # Tag the session with its origin machine
        session.machine_id = machine_id
        return session
    
    async def subscribe_behavior_events(
        self,
        session_id: str,
        machine_id: str | None = None
    ) -> AsyncIterator[dict]:
        """Subscribe to events from a session on any machine."""
        backend = self._get_backend(machine_id or "local")
        async for event in backend.subscribe_behavior_events(session_id):
            event["_machine_id"] = machine_id
            yield event
```

### Proxy Server Implementation (reacher)

The **local REACHER server** implements proxy endpoints for the frontend:

```python
# reacher/api/proxy.py

from fastapi import APIRouter, HTTPException, Depends
from .auth import get_api_key
from .machine_registry import get_machines

router = APIRouter(prefix="/api/proxy")

@router.get("/{device_id}/sessions")
async def proxy_list_sessions(
    device_id: str,
    machines: dict[str, Machine] = Depends(get_machines),
    local_key: str = Depends(get_api_key)
):
    """List sessions on a remote machine, using stored API key."""
    machine = machines.get(device_id)
    if not machine or machine.is_local:
        raise HTTPException(404, "Device not found or is local")
    
    # Forward via BackendProtocol
    from reacher.backend.rest_binding import RESTBackend
    backend = RESTBackend(machine.address, api_key=machine.api_key)
    sessions = await backend.list_sessions()
    return {"sessions": [s.model_dump() for s in sessions]}
```

### Frontend Integration

The frontend adapter switches protocols:

```typescript
// web/src/api/machine-aware-adapter.ts

export class MachineAwareAdapter implements BackendProtocol {
  constructor(
    private restClient: MachineApiClient,  // Local HTTP client
    private machines: Map<string, Machine>
  ) {}

  async listSessions(machineId: string = "local"): Promise<Session[]> {
    if (machineId === "local") {
      // Direct call
      const resp = await this.restClient.request("GET", "/api/sessions");
      return resp.sessions || [];
    }

    // Remote: go through proxy
    const resp = await this.restClient.request(
      "GET",
      `/api/proxy/${machineId}/sessions`
    );
    return resp.sessions || [];
  }

  async *subscribeEvents(
    sessionId: string,
    machineId: string = "local"
  ): AsyncIterableIterator<Event> {
    const machine = this.machines.get(machineId);
    if (!machine) throw new Error(`Machine ${machineId} not found`);

    if (machine.isLocal) {
      // Direct WebSocket
      yield* this.restClient.ws.subscribe(sessionId);
    } else {
      // Proxy-mode WebSocket: local REACHER bridges to remote
      // Need async token fetch for proxy-mode machines
      const token = await this.restClient.getWsTokenAsync(machineId, sessionId);
      yield* this.restClient.ws.subscribeProxy(sessionId, token);
    }
  }
}
```

### Storage: Machine Registry

**Server-side** (reacher):

```python
# reacher/backend/machine_registry.py

@dataclass
class MachineRegistry:
    """Stores paired machines and their API keys server-side."""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._machines: dict[str, Machine] = {}
    
    def register(self, id: str, address: str, api_key: str | None = None):
        """Register a machine. If api_key is None, it's local."""
        self._machines[id] = Machine(
            id=id,
            address=address,
            api_key=api_key,
            is_local=api_key is None
        )
    
    def list(self) -> list[Machine]:
        return list(self._machines.values())
    
    def get_api_key(self, machine_id: str) -> str | None:
        """Retrieve a remote machine's API key (never sent to browser)."""
        return self._machines.get(machine_id).api_key
```

**Client-side** (browser, persisted to localStorage):

```typescript
// web/src/store/useMachineStore.ts

interface MachineRecord {
  id: string;
  name: string;
  address: string;  // No API key here
  mode: "local" | "remote";
  discoveredAt: number;
}

export const useMachineStore = create<MachineStore>((set) => ({
  machines: new Map(),

  async registerRemote(id: string, address: string) {
    // Call server endpoint to register + store API key server-side
    await api.request("POST", "/api/machines/register", {
      device_id: id,
      address,
      api_key: "<obtained via setup wizard>"
    });
    
    // Store locally without the key
    set((state) => {
      state.machines.set(id, {
        id,
        address,
        mode: "remote"
      });
      return state;
    });
  },

  async listSessions(machineId: string = "local") {
    return api.listSessions(machineId);
  }
}));
```

### Benefits

| Aspect | Current | Unified |
|--------|---------|---------|
| **Remote API keys** | Stored on browser (security risk) | Stored server-side only |
| **Cross-machine ops** | Frontend orchestrates N calls | One call to proxy layer |
| **Session → Machine** | Implicit (sessions live on machines) | Explicit (`session.machine_id`) |
| **Protocol abstraction** | None (HTTP-only) | Full (can swap REST ↔ gRPC) |

---

## Part 3: IoT Deployment Patterns (RPi Standalone)

### Current Architecture

- **Desktop**: Labrynth (PyInstaller bundle) launches reacher subprocess on `localhost:6229`
- **Headless RPi**: User runs `python -m reacher` (no GUI), CLI talks to it over REST

**Problem**: If you want to run reacher *only* on an RPi with no GUI, the build/deployment is implicit (install `reacher2p`, run `python -m reacher`). There's no explicit "reacher-only" distribution, and tests have no way to use the backend in-process.

### Proposed Architecture: Three Deployment Profiles

#### Profile 1: Desktop GUI (Labrynth)

```
┌──────────────────────┐
│  Labrynth App        │
│  (PyInstaller)       │
│  ├─ React Frontend   │
│  └─ Backend Launcher │
└──────────────────────┘
         │
         └─► reacher subprocess
             ├─ REST API (:6229)
             ├─ WebSocket handler
             └─ Firmware hex (from package data)
```

**Build**: `python build.py`  
**Distribution**: `Labrynth.exe` / `Labrynth.dmg` / `Labrynth.deb`  
**Launch**: User double-clicks; browser opens to `http://localhost:5173`

#### Profile 2: Standalone RPi (Headless)

```
┌──────────────────────────┐
│  RPi (Raspberry OS)      │
│                          │
│  $ python -m reacher     │
│  ├─ REST API (:6229)     │
│  ├─ WebSocket handler    │
│  └─ Firmware hex         │
│                          │
│  (CLI users SSH in)      │
│  $ reacher-cli --port 6229
└──────────────────────────┘
```

**Install**: `pip install reacher2p[cli]` (or `pip install reacher2p` + add `[cli]` separately)  
**Distribution**: Python package only; OS packages (`.deb`, `.rpm`) optional  
**Launch**: `systemd` unit or manual `python -m reacher`

**Advantages**:
- Single dependency: `reacher2p`
- Firmware hex part of the package, already resolved
- No PyInstaller bloat (reacher is ~50 MB after pip install; PyInstaller bundle adds 200+ MB)
- In-process backend for tests (see below)

#### Profile 3: Testing / In-Process (Development)

```python
# tests/test_backend.py

from reacher.session import SessionManager
from reacher.firmware import FirmwareRegistry
from reacher.backend.in_process import InProcessBackend

async def test_session_lifecycle():
    # Create an in-process backend without HTTP
    sessions = SessionManager(db=":memory:")
    firmware = FirmwareRegistry.from_hex_dir(...)
    backend = InProcessBackend(sessions, firmware)
    
    # Run full test logic against the backend
    session = await backend.create_session(port="/dev/ttyUSB0", paradigm="fr")
    assert session.id
    assert session.state == "idle"
    
    # No HTTP mock needed; direct method calls
```

**Benefits**:
- Tests run fast (no HTTP overhead)
- Full code coverage (no protocol marshalling to hide bugs)
- Tests can run in CI without a real Arduino

### Firmware Hex Resolution Across Deployments

Currently: `build.py` uses `resolve_reacher_hex_dir()` to find `reacher/hex/` at build time.

**Problem**: The function works at *import time*, but PyInstaller may resolve it differently.

**Solution**: Unified hex resolver in `reacher`:

```python
# reacher/firmware.py

def get_firmware_hex_dir() -> str:
    """Return the firmware hex directory, trying several strategies.
    
    Strategies, in order:
    1. REACHER_HEX_DIR env var (override)
    2. Package data: reacher/hex (installed via pip)
    3. Dev-tree fallback: ../reacher-firmware/build/hex (for local dev)
    """
    import os
    from importlib import resources
    
    # Strategy 1: Explicit override
    if override := os.getenv("REACHER_HEX_DIR"):
        if os.path.isdir(override):
            return override
        raise FileNotFoundError(f"REACHER_HEX_DIR points to nonexistent: {override}")
    
    # Strategy 2: Package data (normal case)
    try:
        hex_dir = resources.files("reacher") / "hex"
        path = os.fspath(hex_dir)
        if os.path.isdir(path):
            return path
    except (ImportError, AttributeError):
        pass
    
    # Strategy 3: Dev-tree fallback (for hacking on firmware)
    devpath = os.path.join(
        os.path.dirname(__file__), 
        "..", 
        "reacher-firmware", 
        "build", 
        "hex"
    )
    if os.path.isdir(devpath):
        return devpath
    
    raise FileNotFoundError(
        "Firmware hex not found. Tried:\n"
        "  1. REACHER_HEX_DIR env var\n"
        "  2. reacher/hex/ (from pip package)\n"
        "  3. ../reacher-firmware/build/hex (dev fallback)\n"
        "Install: pip install reacher2p"
    )

class FirmwareRegistry:
    """Singleton registry for compiled firmware hex files."""
    
    @classmethod
    def from_hex_dir(cls, hex_dir: str | None = None) -> FirmwareRegistry:
        if not hex_dir:
            hex_dir = get_firmware_hex_dir()
        return cls(hex_dir)
```

**Usage**:

- **Desktop (Labrynth)**: PyInstaller bundles `reacher/hex/` → strategy 2 works
- **RPi headless**: `pip install reacher2p` → hex is in site-packages → strategy 2 works
- **Tests**: Set `REACHER_HEX_DIR=./fixtures/hex` → strategy 1 works
- **Dev hacking**: Clone `reacher-firmware` → strategy 3 works

### PyInstaller Integration

In `labrynth.spec`:

```python
# labrynth.spec

tree = Tree(
    os.path.join(reacher_pkg, "hex"),
    prefix="reacher/hex",  # Preserve package structure
)
a = Analysis([...], binaries=[...], datas=[(tree, ".")], ...)
```

The hex files land in `_MEIPASS/reacher/hex/`, which `importlib.resources` resolves.

### Three-Profile Deployment Matrix

| Aspect | Desktop | RPi | Tests |
|--------|---------|-----|-------|
| **Binding** | REST (subprocess) | REST (process) or In-Process | In-Process |
| **Frontend** | React GUI | SSH CLI | N/A |
| **Hex resolution** | PyInstaller bundle + import | pip package + import | env var override |
| **Distribution** | `.exe`/`.dmg`/`.deb` | `pip install reacher2p[cli]` | CI environment |
| **Start command** | Double-click app | `python -m reacher` | Import module |

---

## Part 4: Dependency & Import Structure (Avoiding Circular Refs)

### Current Problem

```
labrynth/
├── cli/
│   ├── __main__.py    ──► imports from reacher.api.app
│   ├── app.py         ──► uses ReacherClient
│   └── client.py      ──► raw httpx calls to /api/...
├── build.py           ──► imports from reacher.backend (resolve hex)
└── launcher.py        ──► sets REACHER_STATIC_DIR

reacher/ (external)
├── api/
│   ├── app.py         ──► FastAPI server, /api/... routes
│   └── routes/
│       ├── sessions.py    ──► uses SessionManager
│       └── firmware.py    ──► uses FirmwareRegistry
├── session.py         ──► SessionManager (logic)
├── firmware.py        ──► FirmwareRegistry (logic)
└── hex/
    ├── uno/
    │   ├── fr.hex
    │   └── ...
    └── mega/
        └── ...
```

**Circular risk**: If `cli/client.py` imports from `reacher.backend.protocol` to get `BackendProtocol`, and `reacher.backend` later imports from `reacher.cli` for some reason, we have a cycle.

### Proposed Structure: Clear Layering

```
reacher/ (external)
│
├── backend/
│   ├── __init__.py
│   ├── protocol.py         ← ✓ Core (no internal deps)
│   ├── rest_binding.py     ← REST transport (uses protocol only)
│   ├── in_process.py       ← Direct backend (no HTTP)
│   └── machine_aware.py    ← Multi-machine wrapper
│
├── firmware/
│   ├── registry.py         ← FirmwareRegistry (pure logic)
│   └── resolver.py         ← get_firmware_hex_dir() (env + importlib)
│
├── session/
│   ├── manager.py          ← SessionManager (pure logic)
│   └── models.py           ← Session, etc.
│
├── api/  (HTTP layer — depends on backend + session + firmware)
│   ├── app.py              ← FastAPI app
│   ├── auth.py
│   └── routes/
│       ├── sessions.py     ← Uses SessionManager + BackendProtocol
│       ├── firmware.py     ← Uses FirmwareRegistry
│       └── proxy.py        ← Uses MachineAwareBackend
│
└── cli/  (NOT vendored in reacher; lives in labrynth/cli)
    └── (imports reacher.backend.protocol only)
```

**Dependency Tree** (no cycles):

```
reacher.backend.protocol
    ↑
    ├─ reacher.backend.rest_binding
    ├─ reacher.backend.in_process
    └─ reacher.backend.machine_aware
        ↑
        └─ reacher.api.routes.proxy

reacher.firmware.resolver
    ↑
    └─ reacher.firmware.registry
        ↑
        └─ reacher.api.routes.firmware

reacher.session.models
    ↑
    └─ reacher.session.manager
        ↑
        ├─ reacher.api.routes.sessions
        └─ reacher.backend.in_process

labrynth.cli.app
    ↑
    └─ labrynth.cli.client
        ↑
        ├─ reacher.backend.protocol (abstract interface)
        └─ reacher.backend.rest_binding (HTTP implementation)
```

**No cycles**: Each layer depends upward only; protocol is at the base.

### Import Hygiene Rules

**Rule 1**: `reacher.backend.protocol` must have **zero** internal imports.

```python
# reacher/backend/protocol.py

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Any

# ✓ Only stdlib & typing
# ✗ NO: from reacher.session import SessionManager
# ✗ NO: from reacher.api import app

@dataclass
class Session:
    id: str
    port: str
    ...
```

**Rule 2**: Bindings (`rest_binding.py`, `in_process.py`) import protocol only, not `api`.

```python
# reacher/backend/rest_binding.py

from .protocol import BackendProtocol, Session, BackendError
import httpx

# ✓ Uses protocol classes
# ✗ NEVER: from reacher.api.app import app
```

**Rule 3**: API routes import backends + managers, not vice versa.

```python
# reacher/api/routes/proxy.py

from reacher.backend.machine_aware import MachineAwareBackend
from reacher.backend.protocol import BackendProtocol
from fastapi import APIRouter, HTTPException

# ✓ Backend logic lives here (routes instantiate backends)
# ✗ NO: from reacher.backend import app (would be circular)
```

**Rule 4**: CLI imports only protocol + REST binding.

```python
# labrynth/cli/client.py

from reacher.backend.protocol import BackendProtocol
from reacher.backend.rest_binding import RESTBackend

class CliBackend:
    def __init__(self, base_url: str, api_key: str | None = None):
        self.backend = RESTBackend(base_url, api_key)

# ✓ Depends on backend abstractions, not on reacher.api
# ✗ NEVER: from reacher.api import app
```

### Enforcing with `__all__`

Each module explicitly exports its public API:

```python
# reacher/backend/protocol.py

__all__ = [
    "BackendProtocol",
    "BackendAuth",
    "BackendError",
    "Session",
    "FirmwareBoard",
    "MachineInfo",
]

# reacher/backend/__init__.py

from .protocol import (
    BackendProtocol,
    BackendAuth,
    BackendError,
    Session,
)
from .rest_binding import RESTBackend
from .in_process import InProcessBackend
from .machine_aware import MachineAwareBackend

__all__ = [
    "BackendProtocol",
    "BackendError",
    "Session",
    "RESTBackend",
    "InProcessBackend",
    "MachineAwareBackend",
]
```

### Type Checking

Use `mypy` with strict settings to enforce the layer model:

```toml
# reacher/pyproject.toml

[tool.mypy]
strict = true
disallow_untyped_defs = true
disallow_untyped_calls = true
warn_unused_ignores = true

# Allow protocol stubs to have "..." as body
allow_incomplete_defs = false
allow_untyped_defs = false
```

Then in CI:

```bash
mypy reacher/backend/protocol.py    # Must pass strict mode
mypy reacher/backend/               # All bindings strict
mypy reacher/api/                   # Routes can use bindings
mypy labrynth/cli/                  # CLI can use protocol + bindings
```

### Benefits

| Aspect | Current | Unified |
|--------|---------|---------|
| **Cyclic imports** | Risk if reacher.cli existed | Impossible (protocol at base) |
| **Coupling** | CLI tightly bound to HTTP | CLI coupled only to protocol |
| **Testing imports** | `from reacher.api.app import app` | `from reacher.backend import InProcessBackend` |
| **Type checking** | Not enforced | Enforced by mypy strict |

---

## Part 5: Implementation Roadmap

### Timeline & Phases

#### Phase 0: Foundation (Weeks 1–2)

**Goal**: Establish the protocol and bindings without breaking existing deployments.

**Tasks**:

1. **Create `reacher/backend/protocol.py`**
   - Define `BackendProtocol` ABC with all ~30 methods
   - Define `Session`, `FirmwareBoard`, `BackendError` dataclasses
   - No implementation; abstract only

   **Validation**: Import in tests; verify mypy strict mode passes
   
   **Breaking changes**: None (new module, no imports changed)

2. **Create `reacher/backend/rest_binding.py`**
   - Implement `RESTBackend(BackendProtocol)`
   - Wrap existing reacher API endpoints
   - Use httpx for HTTP requests; websockets for subscriptions
   
   **Validation**: Unit tests against a mock HTTP server
   
   **Breaking changes**: None (new module)

3. **Create `reacher/backend/in_process.py`**
   - Implement `InProcessBackend(BackendProtocol)`
   - Direct calls to `SessionManager`, `FirmwareRegistry`
   - Used for tests only in this phase
   
   **Validation**: Tests can run without HTTP
   
   **Breaking changes**: None (new module)

4. **Update `reacher/firmware/resolver.py`**
   - Centralize `get_firmware_hex_dir()` logic
   - Expose as public API
   
   **Validation**: `build.py` and tests use it
   
   **Breaking changes**: None (refactor existing, interface stays same)

5. **Pin versions in `labrynth/pyproject.toml` and `reacher/pyproject.toml`**
   - Both declare new backend modules but don't use them yet
   - `labrynth` depends on `reacher2p>=3.5.0` (assumes reacher ships protocol)
   
   **Validation**: CI passes; both packages install without errors
   
   **Breaking changes**: None

**Deliverables**:
- `reacher/backend/protocol.py` + `rest_binding.py` + `in_process.py`
- `reacher/backend/__init__.py` (exports public API)
- Updated `reacher/firmware/resolver.py`
- Test suite for each binding (unit tests, no live backend needed)
- mypy strict pass on all three modules

**Rollback**: Delete `reacher/backend/`, revert `resolver.py` changes, downgrade `reacher2p` pin

---

#### Phase 1: CLI Integration (Weeks 3–4)

**Goal**: Migrate CLI to use `BackendProtocol` without changing CLI behavior.

**Tasks**:

1. **Create `labrynth/cli/backend_adapter.py`**
   - Wrap `RESTBackend` with CLI-specific helpers
   - Async-to-sync adapters where needed (e.g., `await backend.list_sessions()` → `sync_list_sessions()`)
   
   **Validation**: All CLI methods still work

2. **Update `cli/__main__.py` and `cli/app.py`**
   - Replace `ReacherClient` with `RESTBackend`
   - Change all calls to use the backend interface
   
   ```python
   # Before
   api = ReacherClient(base_url=f"http://localhost:{args.port}")
   await api.list_sessions()
   
   # After
   api = RESTBackend(base_url=f"http://localhost:{args.port}", api_key=key)
   await api.list_sessions()
   ```
   
   **Validation**: CLI behavior unchanged; all tests pass

3. **Deprecate `cli/client.py`**
   - Mark `ReacherClient` as deprecated (docstring warning)
   - Do **not** delete yet
   - Create a shim that wraps `RESTBackend` for backward compat
   
   ```python
   # labrynth/cli/client.py
   
   import warnings
   from reacher.backend.rest_binding import RESTBackend
   
   class ReacherClient(RESTBackend):
       def __init__(self, *args, **kwargs):
           warnings.warn(
               "ReacherClient is deprecated; use reacher.backend.RESTBackend",
               DeprecationWarning,
               stacklevel=2
           )
           super().__init__(*args, **kwargs)
   ```
   
   **Validation**: Any code importing `ReacherClient` still works; deprecation warning appears

4. **Update CLI tests**
   - Use `InProcessBackend` for unit tests (no HTTP mock needed)
   - Keep integration tests against a real backend
   
   **Validation**: Tests run faster; no HTTP stubs needed

5. **Update `build.py` and `launcher.py`**
   - No code changes (they don't use `cli/client.py` directly)
   - Verify PyInstaller still bundles everything
   
   **Validation**: `python build.py` still produces working bundles

**Deliverables**:
- `labrynth/cli/backend_adapter.py`
- Updated `cli/__main__.py`, `cli/app.py` (uses `RESTBackend`)
- Deprecated `cli/client.py` (shim + warning)
- Updated CLI test suite (uses `InProcessBackend` where possible)
- CLI bundles build and run correctly

**Deprecation Timeline**:
- Phase 1 (now): `ReacherClient` shows deprecation warning
- Phase 2 (4 weeks): `ReacherClient` still works
- Phase 3 (4 weeks): `ReacherClient` removed

**Rollback**: Revert CLI changes; restore old `client.py` usage

---

#### Phase 2: Frontend Integration (Weeks 5–6)

**Goal**: Migrate frontend to use `BackendProtocol` model; keep behavior unchanged.

**Tasks**:

1. **Create `web/src/api/backend-protocol.ts`**
   - TypeScript interfaces matching `BackendProtocol`
   - No implementation yet
   
   ```typescript
   // web/src/api/backend-protocol.ts
   
   export interface BackendProtocol {
     listSessions(machineId?: string): Promise<Session[]>;
     createSession(machineId: string, port: string, paradigm?: string): Promise<Session>;
     startProgram(sessionId: string, machineId?: string): Promise<dict>;
     subscribeBehaviorEvents(sessionId: string, machineId?: string): AsyncIterable<Event>;
     // ... ~30 more methods
   }
   ```
   
   **Validation**: Compiles; types used in app

2. **Create `web/src/api/unified-adapter.ts`**
   - Implements `BackendProtocol` using existing `MachineApiClient` + `ReacherWebSocket`
   - Routes calls to the correct machine (local vs proxy)
   
   **Validation**: All API calls still work; behavior unchanged

3. **Update `web/src/hooks/useSessionWebSockets.ts`**
   - Use unified adapter instead of direct `ReacherWebSocket` calls
   - Add machine-aware subscription logic
   
   **Validation**: Real-time events still arrive; no latency change

4. **Update `web/src/store/useMachineStore.ts`**
   - Store machine metadata (but not remote API keys)
   - Use machine IDs to route calls through unified adapter
   
   **Validation**: Multi-machine discovery still works

5. **Deprecate old API exports**
   - Keep `MachineApiClient` and `ReacherWebSocket` in place
   - Add deprecation comments
   - Do **not** delete
   
   **Validation**: Old code still imports; no runtime errors

6. **Update frontend tests**
   - Mock `BackendProtocol` instead of HTTP responses
   - Use in-memory mock for faster tests
   
   **Validation**: Tests run in <1s per suite

**Deliverables**:
- `web/src/api/backend-protocol.ts` (interface)
- `web/src/api/unified-adapter.ts` (implementation)
- Updated `useSessionWebSockets.ts`, `useMachineStore.ts`
- Updated frontend test mocks (use `BackendProtocol`)
- Frontend dev server still works; no visible changes to UI

**Deprecation Timeline**:
- Phase 2 (now): `MachineApiClient` has deprecation comments
- Phase 3 (4 weeks): TypeScript strict mode warnings for old API use
- Phase 4 (8 weeks): Remove old exports

**Rollback**: Revert TS files; restore old API usage

---

#### Phase 3: Server-Side Proxy Mode (Weeks 7–8)

**Goal**: Move machine registry and proxy logic into `reacher` backend.

**Tasks**:

1. **Create `reacher/backend/machine_aware.py`**
   - Implement `MachineAwareBackend(BackendProtocol)`
   - Routes calls to correct backend based on machine ID
   - Stores machine list + API keys server-side
   
   **Validation**: Unit tests pass; routing logic correct

2. **Create `reacher/api/routes/proxy.py`**
   - New REST endpoints: `/api/proxy/{deviceId}/*`
   - Forward calls to remote REACHER using `MachineAwareBackend`
   - Store machine metadata in SQLite
   
   **Validation**: Frontend can register remote machines; calls forward correctly

3. **Update `reacher/api/app.py`**
   - Mount proxy router
   - Ensure auth checks still work
   
   **Validation**: All existing endpoints still work; new ones are protected

4. **Update frontend**
   - Call `/api/machines/register` to add remote machines
   - Unified adapter routes calls through `/api/proxy/*` for remote machines
   
   **Validation**: Multi-machine operation works end-to-end

5. **Update deployment docs**
   - Document machine registration workflow
   - Remote API key setup
   
   **Validation**: New users can follow the guide

**Deliverables**:
- `reacher/backend/machine_aware.py`
- `reacher/api/routes/proxy.py`
- Updated `reacher/api/app.py`
- Updated frontend machine store integration
- Deployment guide for multi-machine setup

**Breaking changes**: None (new endpoints, existing ones unchanged)

**Rollback**: Delete proxy routes; revert frontend machine store changes

---

#### Phase 4: Testing & Hardening (Weeks 9–10)

**Goal**: Full test coverage; ensure all deployment profiles work.

**Tasks**:

1. **Add integration tests for all profiles**
   - Desktop (subprocess backend via HTTP)
   - RPi (standalone backend, HTTP)
   - Tests (in-process backend, no HTTP)
   
   ```bash
   # tests/test_profiles.py
   
   async def test_desktop_profile():
       """Labrynth GUI + subprocess backend."""
       # Use REST backend pointing to real subprocess
   
   async def test_rpi_profile():
       """Standalone reacher on RPi."""
       # Use REST backend pointing to remote IP
   
   async def test_in_process_profile():
       """CI tests using in-process backend."""
       # Use in-process backend directly
   ```
   
   **Validation**: All profiles pass tests

2. **Add firmware hex resolution tests**
   - Test strategy 1 (env var override)
   - Test strategy 2 (package data)
   - Test strategy 3 (dev fallback)
   
   **Validation**: Hex resolver works in all scenarios

3. **Add multi-machine tests**
   - Register remote machine
   - Run cross-machine session lifecycle tests
   
   **Validation**: Proxy mode handles remote calls

4. **Performance benchmarks**
   - Compare old `ReacherClient` vs new `RESTBackend` latency
   - Ensure no regressions
   
   **Validation**: Latency within 5% of old

5. **Load testing**
   - 10+ concurrent sessions across 2–3 machines
   - Verify proxy layer doesn't bottleneck
   
   **Validation**: No crashes; response times acceptable

6. **Update CI/CD**
   - Run all three profile tests
   - Build desktop bundles + test them
   - Test RPi deployment instructions
   
   **Validation**: CI gates on all tests

**Deliverables**:
- Comprehensive test suite covering all profiles
- Performance baseline + regression detection
- Updated CI workflow (test all profiles)

**Breaking changes**: None

**Rollback**: Disable new tests; keep old ones

---

#### Phase 5: Documentation & Release (Weeks 11–12)

**Goal**: Clear migration path; users understand the new architecture.

**Tasks**:

1. **Write architecture guide**
   - BackendProtocol overview
   - Multi-machine deployment
   - Development setup (in-process testing)
   
2. **Write migration guide for integrators**
   - If your tool calls `reacher` REST API, nothing changes
   - If your tool imports from `reacher`, update imports to use `backend.protocol`
   - Old imports still work with deprecation warnings

3. **Update API docs**
   - Proxy endpoints documented
   - Machine registration flow
   - Error codes

4. **Release notes**
   - Version: `3.5.0` (or `4.0.0` if treating as major milestone)
   - Highlight: unified backend, multi-machine, in-process testing
   - Deprecations: `cli.client.ReacherClient`, old TS API exports (warning phase)

5. **Tag stable versions**
   - `reacher2p>=3.5.0` (ships protocol + bindings)
   - `labrynth>=3.1.0` (uses new protocol)

6. **Update README**
   - Add "three deployment profiles" section
   - Link to architecture guide

**Deliverables**:
- `docs/BACKEND_ARCHITECTURE.md` (unified architecture overview)
- `docs/MULTI_MACHINE_DEPLOYMENT.md` (setup guide)
- `docs/TESTING.md` (in-process backend for tests)
- `docs/MIGRATION.md` (for existing integrators)
- Release notes in GitHub releases
- Updated README with deployment profiles

---

### Deprecation Schedule (Key Dates)

| Item | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|------|---------|---------|---------|---------|---------|
| `cli.client.ReacherClient` | ⚠️ Warn | ✓ Works | ✓ Works | ✓ Works | Removed v3.6 |
| Old TS API exports | — | 💬 Comment | ✓ Works | ⚠️ Warn | Removed v3.2 |
| HTTP only (no proxy) | ✓ Works | ✓ Works | — | ✓ Works | — |
| Hex resolver (old code) | ✓ Works | ✓ Works | ✓ Works | ✓ Works | ✓ Works (compat) |

**Removal dates**:
- `ReacherClient` removed: **v3.6.0** (4 weeks after Phase 1)
- Old TS exports removed: **v3.2.0** (2 weeks after Phase 2)

---

### Risk Mitigation & Rollback

#### Risk 1: Breaking HTTP API Changes

**If** REST endpoint signature changes unexpectedly:
- Keep old endpoint working (e.g., `/api/sessions` → `/api/v2/sessions`)
- `RESTBackend` uses old path
- Backend auto-detects version and adapts

**Rollback**: Revert REST changes; `RESTBackend` still works

#### Risk 2: Multi-Machine Proxy Failures

**If** proxy layer drops requests or corrupts data:
- Disable proxy in config: `REACHER_PROXY_DISABLED=1`
- Frontend falls back to direct HTTP (requires API key on browser)
- Rollback: Users use local-only mode temporarily

#### Risk 3: Firmware Hex Resolution Fails

**If** `get_firmware_hex_dir()` can't find hex files:
- Fall back to env var: `REACHER_HEX_DIR=/path/to/hex`
- Clear error message with all tried paths
- Build fails loudly (doesn't silently use wrong hex)

**Rollback**: Set `REACHER_HEX_DIR` explicitly; revert resolver changes

#### Risk 4: In-Process Backend Performance

**If** tests using `InProcessBackend` are slower than expected:
- Profile and optimize hot paths (session creation, firmware lookup)
- Implement caching for firmware registry
- Consider async I/O for serial reads

**Rollback**: Keep old unit test approach; use in-process only for integration

#### Risk 5: TypeScript Type Mismatches

**If** frontend type definitions don't match backend:
- CI blocks on TypeScript strict mode (catches this)
- `reacher` exports Python type stubs (`.pyi` files)
- `web/` has `BackendProtocol` TypeScript interface as single source of truth

**Rollback**: Use `any` types temporarily; fix type defs before next phase

---

### Success Criteria per Phase

| Phase | Success Criterion |
|-------|-------------------|
| **0** | Protocol + bindings can be imported; mypy strict passes; no existing tests fail |
| **1** | CLI works with `RESTBackend`; all CLI tests pass; deprecation warning on old code |
| **2** | Frontend works with unified adapter; multi-machine UI works; tests run 10x faster |
| **3** | Proxy endpoints functional; remote machine calls work; no latency regression |
| **4** | All three profiles pass tests; performance baseline established; load test passes |
| **5** | Docs complete; integrators have migration guide; no GitHub issues on architecture |

---

### Concurrent Work (Parent Agents)

**For Fable-tier lead**:
- Review architecture design (Part 1–4) in Phases 0–1
- Approve protocol interface before Phase 0 starts
- Sign off on deprecation timeline in Phase 5

**For Opus-tier frontend specialist**:
- In Phase 1: coordinate CLI testing strategy
- In Phase 2: review TypeScript interface design
- In Phase 4: run performance benchmarks
- In Phase 5: validate deployment guide with real hardware

---

## Summary Table: Before vs. After

| Dimension | Current | After Unification |
|-----------|---------|-------------------|
| **Code duplication** | CLI + Frontend both implement REST calls | Single `BackendProtocol` + bindings |
| **API schema** | No shared model | Protocol dataclasses + TS interfaces |
| **Error handling** | Ad-hoc (HTTP status → error message) | `BackendError` hierarchy |
| **Multi-machine** | Frontend orchestrates N calls | Proxy routes transparently |
| **Testing** | Mock HTTP + live server | `InProcessBackend` (no HTTP) |
| **RPi deployment** | Implicit (`pip install reacher2p`) | Explicit three profiles + docs |
| **Firmware resolution** | `build.py` only; fragile | Centralized, env-overridable resolver |
| **Dependency cycles** | Risk (if CLI imported from reacher) | Impossible (protocol at base) |
| **Type safety** | Loose (no shared types) | TypeScript + mypy strict |
| **Breaking changes** | Potential in each release | Planned deprecation phases + rollback |

---

## Next Steps

1. **Fable-tier lead**: Review this architecture (Sections 1–4); approve or iterate
2. **This subagent**: Draft Phase 0 (protocol + bindings) implementation spec
3. **Opus-tier frontend specialist**: Review multi-machine design; assess testing strategy
4. **All**: Schedule kickoff for Phase 0 (target: Week 1)

---

**Document Version**: 1.0  
**Last Updated**: 2026-09-23  
**Audience**: Internal architecture review (will be shared with parent agents)
