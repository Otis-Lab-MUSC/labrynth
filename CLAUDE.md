# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**Labrynth** is the application shell and orchestrator for the REACHER neuroscience experiment control platform — it bundles a React frontend, Python terminal CLI, and a build pipeline into standalone cross-platform installers. The actual experiment backend logic lives in the separate `reacher` Python package (installed as a `pip` dependency, not vendored here), which **also ships the Arduino firmware hex artifacts as package data** (`reacher/hex/<board>/`). Firmware source moved into the reacher repo when `reacher-firmware` was archived — labrynth no longer carries a firmware submodule. Backend or firmware changes require modifying `reacher`, not labrynth.

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
python -m reacher   # Backend at http://localhost:6229
# Firmware hex is resolved from the installed reacher package automatically;
# set REACHER_HEX_DIR only to override with a local hex tree.
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
pip install -e ../reacher                 # First-time/dev: install reacher (ships firmware hex)
python build.py                           # All 4 stages
python build.py --skip-frontend           # Reuse existing web/dist/
python build.py --avrdude /usr/bin/avrdude  # Bundle a specific avrdude binary
```

Build pipeline: (0) validate env (reacher install + its bundled firmware hex) → (1) `npm ci && npm run build` → (2) verify assets → (3) PyInstaller. Firmware hex is sourced from the installed `reacher` package (`reacher/hex/<board>/`) — no compile or fetch step. **Output: `dist/Labrynth/` (Linux/Windows) or `dist/Labrynth.app` (macOS).**

### Versioning

```bash
python scripts/bump-version.py                     # Print current version + reacher pin
python scripts/bump-version.py 3.1.0-beta.1        # Set app version (pyproject.toml + web/package.json + README badge)
python scripts/bump-version.py --stage alpha        # Advance to next alpha/beta/rc/stable automatically
python scripts/bump-version.py --check 3.1.0-beta.1         # Verify all files match (CI uses this)
python scripts/bump-version.py --reacher-pin 3.1.0          # Set the reacher dependency pin (semver in, PEP 440 out)
python scripts/bump-version.py --validate-stable             # Exit 1 if current version has a prerelease suffix
python scripts/bump-version.py --print-reacher-ref           # Print the reacher git ref from the stored pin
```

The app version and the `reacher` pin are **independent axes**. `--reacher-pin`
takes the backend's semver and writes the PEP 440 form pip resolves
(`3.0.0-alpha.1` → `reacher>=3.0.0a1`) so the prerelease pin is never
hand-derived; bump it to ship a newer reacher backend + firmware. Never
hand-edit either — the README badge is stamped by the version bump, and CI
gates tag builds on `--check` consistency.

**`--stage`** advances through the prerelease ladder automatically:
`alpha.N` → `alpha.N+1`, `alpha.N` → `beta.1` (promotion resets the counter),
`beta.N` → `rc.1`, `rc.N` → stable (strips suffix). Prevents manual counter math
and enforces the forward-only ladder (regression exits 1).

See `RELEASING.md` for the full release workflow and the two-workflow model
(`build-installers.yml` for stable, `build-prerelease.yml` for alpha/beta/rc).

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

- **`build.py`** — 4-stage orchestrator. Firmware hex is sourced from the installed `reacher` package via `resolve_reacher_hex_dir()` (uses `importlib.resources`); there is no firmware compile/fetch step. `labrynth.spec` imports the same resolver so both agree on the hex source.
- **`launcher.py`** — PyInstaller entry point; sets `REACHER_STATIC_DIR` so the bundled backend serves `web/dist/`.
- **`labrynth.spec`** — bundles `web/dist/` → `static/`, the reacher package's `hex/` → `hex/` (resolved via `build.resolve_reacher_hex_dir()`), and avrdude (binary, companion DLLs/`.so`/`.dylib`, and `avrdude.conf`) → `avrdude/` inside `_MEIPASS`. Avrdude path comes from `REACHER_AVRDUDE_PATH` env var (set by `build.py --avrdude`).

### CI/CD (`.github/workflows/`)

- **`build-installers.yml`** — stable releases only (`vX.Y.Z` tags, no prerelease suffix). Builds Windows `.exe`, macOS `.dmg`, Linux `.deb` + `.tar.gz` + `.AppImage`. `prerelease: false` hardcoded. Use `/release` skill to cut stable.
- **`build-prerelease.yml`** — prerelease builds (`vX.Y.Z-alpha.*`, `vX.Y.Z-beta.*`, `vX.Y.Z-rc.*` tags). Same build matrix; `prerelease: true` hardcoded. Platform builds use `continue-on-error: true` (alpha may fail a platform). The reacher ref to bundle is derived automatically from the `reacher>=` pin in `pyproject.toml` via `--print-reacher-ref`. Do **not** use `/release` for prereleases — see `RELEASING.md`.
- **`deploy-demo.yml`** — deploys `web/dist/` (built with `VITE_DEMO_SITE=true`) as a static demo site. Demo mode swaps the API client for `demoClient.ts` + `mock.ts` and disables real backend calls.

## Conventions

- Backend port is **6229** (`REACHER_PORT`); frontend dev port is **5173**. Vite proxies `/api` and `/ws` from `:5173` to `:6229`.
- All `/api/*` routes require `Authorization: Bearer <key>`; WebSocket uses `?token=<key>`. The browser never sees remote machines' API keys (proxy mode).
- Versions in `pyproject.toml` and `web/package.json` are kept in sync via `scripts/bump-version.py` — never bump them by hand.
- `__APP_VERSION__` is injected at Vite build time from `web/package.json` and shown in the footer for the `reacher` theme.
- Don't add a test framework without coordinating — the project deliberately has none.
- The `reacher` package is an external dependency that bundles both backend logic and firmware hex; changes to firmware behavior or backend logic happen in the reacher repo, not here.
