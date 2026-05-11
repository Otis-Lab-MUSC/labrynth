# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Labrynth** is the application shell and orchestrator for the REACHER neuroscience experiment control platform — it bundles a React frontend, Python terminal CLI, Arduino firmware (as a submodule), and a build pipeline into standalone cross-platform installers. The actual experiment backend logic lives in the separate `reacher` Python package (installed as a `pip` dependency, not vendored here). Backend behavior changes require modifying `reacher`, not labrynth.

## Commands

### Frontend (`web/`)

```bash
cd web
npm ci
npm run dev         # Dev server :5173 — proxies /api and /ws to localhost:6229
npm run build       # tsc -b && vite build → web/dist/
npm run build:demo  # Same with VITE_DEMO_SITE=true (deploys to static hosting via deploy-demo.yml)
npm run lint        # ESLint
```

### Backend for frontend dev

```bash
export REACHER_STATIC_DIR=$(pwd)/web/dist
export REACHER_HEX_DIR=$(pwd)/firmware/hex
python -m reacher   # Backend at http://localhost:6229
```

### Python CLI

```bash
pip install -e ".[cli]"      # prompt_toolkit, httpx, websockets
python -m cli                # Auto-starts backend subprocess (waits up to 15s) + opens TUI
python -m cli --no-server    # TUI only — backend must already be running
python -m cli --port 6229    # Custom port
reacher-cli                  # Console-script alias (same as `python -m cli`)
```

### Full standalone build

```bash
git submodule update --init --recursive   # First-time only — pulls reacher-firmware
python build.py                           # All 5 stages
python build.py --skip-firmware           # Reuse existing firmware/hex/
python build.py --skip-frontend           # Reuse existing web/dist/
python build.py --avrdude /usr/bin/avrdude  # Bundle a specific avrdude binary
```

Build pipeline: (0) validate env (submodule + reacher install) → (1) compile/fetch firmware hex via `firmware/compile.sh` or GitHub raw → (2) `npm ci && npm run build` → (3) verify assets → (4) PyInstaller. **Output: `dist/Labrynth/` (Linux/Windows) or `dist/Labrynth.app` (macOS).**

### Versioning

```bash
python scripts/bump-version.py              # Print current version + firmware submodule SHA
python scripts/bump-version.py 2.1.20       # Set version in pyproject.toml + web/package.json
python scripts/bump-version.py --check 2.1.20  # Verify all files match (CI uses this)
python scripts/bump-version.py --check-firmware  # Verify firmware submodule matches develop HEAD
```

**Pre-bump checklist:** before bumping to a new version, confirm the firmware submodule is current:

```bash
python scripts/bump-version.py --check-firmware
```

If stale, sync first:

```bash
git submodule update --remote --merge firmware
git add firmware
git commit -m "chore(firmware): sync submodule to develop HEAD"
```

CI (`build-installers.yml`) also rejects tag builds where the submodule pointer diverges from `reacher-firmware` develop HEAD. If the submodule is deliberately pinned to a non-develop commit, trigger the build via `workflow_dispatch` instead of a tag push.

### Testing

There is **no test framework configured** here (no pytest, no Vitest/Jest). ESLint is the only automated quality check. Verify changes by running the frontend dev server against a live backend.

## Architecture

```
Arduino firmware ──serial──► reacher (external pip pkg) ──REST + WS──► React (web/)
                                          ▲                                ▲
                                     cli/ (TUI, same REST API)             │
                                                                Multi-machine: local +
                                                                remote REACHER hosts
```

### Multi-machine model (key concept)

The frontend talks to **multiple REACHER instances simultaneously**. `useMachineStore` owns the list of paired machines (local + remote, persisted to `localStorage`). Each machine gets its own `MachineApiClient`. There are two communication modes:

- **Local / direct mode** — same-origin or trusted base URL; the browser holds an API key directly.
- **Proxy mode** — for paired remote machines, all calls route through `/api/proxy/{deviceId}/...` on the *local* REACHER server, which holds the remote API key server-side. The browser never sees remote API keys. WebSocket tokens for proxy-mode machines require an async fetch (`getWsTokenAsync`); local machines have synchronous tokens.

Machine discovery uses mDNS (polled by `useMachineStore.startDiscoveryPolling`). `useSessionRecovery` waits for `useMachineStore.ready` before restoring sessions from `localStorage`.

### Frontend (`web/src/`)

- **`api/`** — `client.ts` (`MachineApiClient`, all REST), `websocket.ts` (auto-reconnecting `ReacherWebSocket`), `sessionClient.ts` (session-scoped helpers), `demoClient.ts` + `mock.ts` (demo-mode fakes).
- **`store/`** — Zustand stores: `useSessionStore` (sessions Map, events, counters, draft sessions), `useMachineStore` (machines + discovery + per-machine `MachineApiClient` cache outside Zustand state), `useThemeStore`, `useNavigationStore` (active panel: `session | configuration | monitor | data`), `useLogStore`, `useTutorialStore` (also owns `demoMode`), `useUserPresetStore`.
- **`hooks/useSessionWebSockets.ts`** — central WS router: opens one `ReacherWebSocket` per non-draft session, dispatches all incoming message types (`event | frame | config | log | error | upload_progress | session_state | disconnect | export_failed | kernel_error | split | restart`) to the appropriate stores. Skips draft sessions and demo-prefixed IDs. Recovers missed events on reconnect via `client.getBehavior(sessionId)`.
- **`hooks/useSingleTab.ts`** — enforces single-tab usage (other tabs see a blocked screen).
- **`components/`** — feature-area folders: `session/`, `configuration/`, `monitor/`, `data/`, `hardware/`, `program/`, `machines/`, `terminal/`, `layout/`, `tutorial/`.
- **`themes/`** — 5 named themes (`reacher`, `terminal`, `neural`, `midnight`, `ember`), each with a `dark` and `light` palette plus background, font, radius, glass tokens. Theme is applied by writing CSS variables on `:root` (no Tailwind dark-mode toggle alone — `apply()` in `useThemeStore` sets `--color-*`, `--font-*`, etc.). Default: `reacher`. Persistence: `localStorage["labrynth-mode"]`.
- **`types/index.ts`** — shared TypeScript interfaces (`Session`, `Machine`, `BehaviorEvent`, `FirmwareConfig`, …).

Session lifecycle: `idle → uploading → connected → running → paused → stopped` (plus `disconnected` for serial drop). Real-time counters (infusions, presses, trials, frames, CS+/CS−) are driven entirely by WebSocket events, not by polling.

### CLI (`cli/`)

- **`__main__.py`** — entry point. If backend isn't already on the port, spawns `python -m reacher` as a subprocess and waits up to 15 s for it to become reachable.
- **`app.py`** — `ReacherCLI` (prompt_toolkit). Four modes: `MENU`, `INPUT`, `SELECT`, `MONITOR` (live WS feed). State + counters live on `SessionState` dataclass.
- **`client.py`** — `ReacherClient`, async HTTP wrapper around the REST endpoints.

The CLI mirrors browser-UI capabilities (sessions, hardware, program presets, limits, data export, live monitor).

### Build system

- **`build.py`** — 5-stage orchestrator. **Firmware fetch defaults to the `develop` branch** of `Otis-Lab-MUSC/reacher-firmware` (via raw GitHub URLs) when `--use-github` is passed; otherwise compiles locally via `firmware/compile.sh`. The `firmware/` submodule itself tracks `develop`.
- **`launcher.py`** — PyInstaller entry point; sets `REACHER_STATIC_DIR` so the bundled backend serves `web/dist/`.
- **`labrynth.spec`** — bundles `web/dist/` → `static/`, `firmware/hex/` → `hex/`, and avrdude (binary, companion DLLs/`.so`/`.dylib`, and `avrdude.conf`) → `avrdude/` inside `_MEIPASS`. Avrdude path comes from `REACHER_AVRDUDE_PATH` env var (set by `build.py --avrdude`).

### CI/CD (`.github/workflows/`)

- **`build-installers.yml`** — on `v*.*.*` tags, builds Windows `.exe` (Inno Setup `installer/reacher.iss`), macOS `.dmg`, Linux `.deb` + `.tar.gz`.
- **`deploy-demo.yml`** — deploys `web/dist/` (built with `VITE_DEMO_SITE=true`) as a static demo site. Demo mode swaps the API client for `demoClient.ts` + `mock.ts` and disables real backend calls.

## Conventions

- Backend port is **6229** (`REACHER_PORT`); frontend dev port is **5173**. Vite proxies `/api` and `/ws` from `:5173` to `:6229`.
- All `/api/*` routes require `Authorization: Bearer <key>`; WebSocket uses `?token=<key>`. The browser never sees remote machines' API keys (proxy mode).
- Versions in `pyproject.toml` and `web/package.json` are kept in sync via `scripts/bump-version.py` — never bump them by hand.
- `__APP_VERSION__` is injected at Vite build time from `web/package.json` and shown in the footer for the `reacher` theme.
- Don't add a test framework without coordinating — the project deliberately has none.
- The `firmware/` submodule and the `reacher` package are external dependencies; changes to firmware behavior or backend logic happen in those repos, not here.
