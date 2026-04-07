# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Labrynth** is the application shell and orchestrator for the REACHER neuroscience experiment control platform — it bundles a React frontend, Python terminal CLI, Arduino firmware, and a build pipeline into standalone cross-platform installers. The actual experiment backend logic lives in the separate `reacher` Python package (installed as a dependency).

## Commands

### Frontend (`web/`)

```bash
cd web
npm ci              # Install dependencies
npm run dev         # Dev server at http://localhost:5173 (proxies API to localhost:6229)
npm run build       # TypeScript check + Vite production build → web/dist/
npm run build:demo  # Same but with VITE_DEMO_SITE=true for static hosting
npm run lint        # ESLint check
```

### Python CLI

```bash
pip install -e ".[cli]"   # Install CLI with dependencies (prompt_toolkit, httpx, websockets)
python -m cli             # Start backend automatically + open terminal UI
python -m cli --no-server # Terminal UI only (assumes backend already running at localhost:6229)
```

### Full Build (produces standalone executables)

```bash
python build.py                        # All 5 stages: validate → firmware → frontend → assets → PyInstaller
python build.py --skip-firmware        # Skip Arduino compilation
python build.py --skip-frontend        # Skip npm build
python build.py --avrdude /path/avrdude  # Bundle specific avrdude binary
```

**Build outputs:** `dist/REACHER/` (Linux/Windows) or `dist/REACHER.app` (macOS)

### Running the Backend for Frontend Development

```bash
export REACHER_STATIC_DIR=$(pwd)/web/dist
export REACHER_HEX_DIR=$(pwd)/firmware/hex
python -m reacher   # Starts backend at http://localhost:6229
```

## Architecture

```
Arduino Firmware ◄──serial──► reacher (Python pkg) ◄──REST + WebSocket──► React Frontend (web/)
                                        ▲
                                   cli/ (terminal UI wraps same REST API)
```

**The `reacher` package is external** — Labrynth consumes it but does not contain it. Changes to backend behavior require modifying the `reacher` package separately.

### Frontend (`web/src/`)

- **`api/client.ts`** — all REST calls; **`api/websocket.ts`** — auto-reconnecting WebSocket
- **`store/`** — Zustand stores: `useSessionStore` (sessions, events, counters; persisted) and `useThemeStore` (dark/light; persisted to `localStorage`)
- **`hooks/useWebSocket.ts`** — central message router: dispatches incoming WebSocket events to store and component handlers
- **`components/`** — organized by feature area: `monitor/`, `program/`, `hardware/`, `session/`, `data/`, `layout/`, `tutorial/`
- **`types/index.ts`** — all shared TypeScript interfaces (`Session`, `BehaviorEvent`, etc.)

Session lifecycle state machine: `idle → uploading → connected → running → paused → stopped`

Real-time counters (infusions, lever presses, trials, licks, frames) are driven entirely by WebSocket events.

### CLI (`cli/`)

- **`app.py`** (~63KB) — prompt_toolkit terminal UI with 4 modes: `MENU` (arrow-key navigation), `INPUT` (text prompts), `SELECT` (dynamic list), `MONITOR` (live WebSocket event feed)
- **`client.py`** — async HTTP wrapper (`ReacherClient`) mirroring all REST endpoints
- **`__main__.py`** — entry point; optionally auto-starts the reacher backend subprocess before launching the TUI

### Build System

- **`build.py`** — 5-stage orchestrator: (1) validate submodules + reacher install, (2) compile firmware hex files, (3) npm build, (4) verify assets, (5) PyInstaller bundle
- **`launcher.py`** — PyInstaller entry point; sets `REACHER_STATIC_DIR` env var so the backend serves the bundled frontend
- **`reacher.spec`** — PyInstaller spec; bundles `web/dist/`, `firmware/hex/`, and avrdude binary
- **`firmware/`** — git submodule (`reacher-firmware`, `beta` branch); hex files in `firmware/hex/uno/` and `firmware/hex/mega/`

### CI/CD

`.github/workflows/build-installers.yml` triggers on version tags (`v*.*.*`) and produces:
- Windows: Inno Setup `.exe` (via `installer/reacher.iss`)
- macOS: `.dmg` disk image
- Linux: `.deb` package + `.tar.gz` tarball

## Key Configuration

| File | Purpose |
|------|---------|
| `web/vite.config.ts` | Proxies `/api/*` and `/ws/*` to `localhost:6229` in dev |
| `web/tsconfig.json` | Strict TypeScript, ESNext target |
| `pyproject.toml` | Python packaging; `[cli]` optional extras; `reacher-cli` console script |

## Frontend Design System

- **Theme:** Dark mode default (black bg, neon green `#00FF41` accent); light mode (`#16A34A`)
- **Font:** JetBrains Mono (monospace throughout)
- **CSS:** Tailwind CSS 3.4 with custom theme layers in `web/src/index.css`
- **Theme persistence:** `localStorage` keys `labrynth-mode` and `labrynth-theme-id`

## No Test Framework

There is currently no test framework configured (no pytest, no Vitest/Jest). Linting via ESLint is the only automated quality check for the frontend.
