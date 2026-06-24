# Labrynth — Application Shell

**Build orchestrator, React frontend, and terminal CLI for the REACHER ecosystem**

[![Version](https://img.shields.io/badge/version-3.0.0-blue)](https://github.com/Otis-Lab-MUSC/labrynth/releases)
[![Python](https://img.shields.io/badge/python-3.10+-blue)](https://www.python.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-orange)](CHANGELOG.md)
[![Phoxel Workbench](https://img.shields.io/badge/Phoxel_Workbench-member-orange)](https://github.com/Otis-Lab-MUSC)

*Written by*: Joshua Boquiren

[![](https://img.shields.io/badge/@thejoshbq-grey?style=flat&logo=github)](https://github.com/thejoshbq)

---

## Download

Prebuilt installers for **Windows (`.exe`)**, **macOS (`.dmg`)**, and **Linux
(`.deb` / `.AppImage`)** are attached to each [GitHub Release](https://github.com/Otis-Lab-MUSC/labrynth/releases).

**Release channels** (newest first reach testers earliest):

| Channel | Tag form | Audience | Marked |
|---|---|---|---|
| Alpha | `vX.Y.Z-alpha.N` | Lab / internal testing | Pre-release |
| Beta | `vX.Y.Z-beta.N` | Trusted external testers | Pre-release |
| Release candidate | `vX.Y.Z-rc.N` | Final validation | Pre-release |
| Stable | `vX.Y.Z` | General use | Latest |

> **Beta testers:** grab the newest **pre-release** from the
> [releases page](https://github.com/Otis-Lab-MUSC/labrynth/releases) and pick
> the asset for your OS. Stable builds appear under
> [Latest release](https://github.com/Otis-Lab-MUSC/labrynth/releases/latest).

---

## Overview

**Labrynth** is the application shell for the [REACHER](https://github.com/otis-lab-musc/reacher) ecosystem. It bundles:

- A **React 19 + TypeScript frontend** (Vite + Tailwind CSS) for browser-based experiment control
- A **terminal CLI** (`cli/`) using prompt_toolkit for arrow-key navigable menus, text prompts, and live WebSocket event streaming
- A **build pipeline** (`build.py`) that builds the frontend and packages everything into a standalone executable via PyInstaller

The Python backend ([reacher](https://github.com/otis-lab-musc/reacher)) is installed as a pip dependency. It also ships the pre-compiled Arduino firmware hex files as package data (firmware source moved into the reacher repo when `reacher-firmware` was archived), so labrynth no longer carries a firmware submodule.

---

## Architecture

```
labrynth/
├── web/                    # React 19 + TypeScript + Vite + Tailwind frontend
├── cli/                    # Terminal CLI (prompt_toolkit)
│   ├── __main__.py         # Entry point, auto-start logic
│   ├── app.py              # ReacherCLI — menus, rendering, actions
│   └── client.py           # ReacherClient — async HTTP wrapper
├── build.py                # Build orchestrator (frontend → PyInstaller; hex from reacher pkg)
├── labrynth.spec           # PyInstaller spec file
├── launcher.py             # Thin entry point for PyInstaller
└── pyproject.toml          # Build dependencies
```

**Dependency flow:**
```
labrynth ──pip install──→ reacher2p (Python library + firmware hex as package data; imported as `reacher`)
labrynth ──pip install──→ prompt_toolkit, httpx, websockets (CLI deps)
```

---

## Terminal CLI

The CLI provides a full-featured terminal interface to the REACHER backend, mirroring the browser UI's capabilities without requiring a web browser.

### Installation

```bash
pip install -e ".[cli]"
```

### Running

```bash
python -m cli                  # auto-start backend + CLI
python -m cli --no-server      # CLI only (backend must be running)
python -m cli --port 6229      # custom backend port
```

Or via the console script:

```bash
reacher-cli
```

The CLI auto-detects whether the backend is running. If not, it starts the backend as a subprocess and waits up to 15 seconds for it to become ready.

### Standalone binary (no Python required)

A self-contained `LabrynthCLI` bundle ships with each release (`labrynth-cli-*-<os>.tar.gz`) for headless hosts (e.g. a display-less Raspberry Pi). Extract and run the `LabrynthCLI` executable — it bundles the reacher backend and firmware hex, and starts the backend itself (no separate install). Build it locally with `python build.py --cli` (adds the CLI bundle to the GUI build) or `python build.py --cli-only`.

### Modes

The CLI operates in four modes:

| Mode | Description | Navigation |
|---|---|---|
| **MENU** | Arrow-key navigable hierarchical menus | Up/Down to navigate, Enter to select, Esc to go back |
| **INPUT** | Text prompt for entering values (ports, durations, etc.) | Type value, Enter to submit, Esc to cancel |
| **SELECT** | Arrow-key selection from a dynamic list (ports, paradigms, etc.) | Up/Down to navigate, Enter to select, Esc to cancel |
| **MONITOR** | Live WebSocket event stream with counters | Esc to exit monitor |

### Menu Structure

```
Main Menu
├── Session
│   ├── Create New Session          # Select port → select paradigm → create
│   ├── Connect                     # Connect serial to session's port
│   ├── Disconnect                  # Disconnect serial
│   ├── Upload Firmware             # Select board → select paradigm → upload
│   ├── Reset Session               # Reset session state
│   ├── Destroy Session             # Tear down session
│   ├── Session Info                # Display session metadata
│   └── Back
├── Hardware
│   ├── RH Lever                    # Arm/Disarm, Timeout, Ratio, Active/Inactive
│   ├── LH Lever                    # Arm/Disarm, Timeout, Ratio, Active/Inactive
│   ├── Primary Cue                 # Arm/Disarm, Test, Frequency, Duration
│   ├── Secondary Cue               # Arm/Disarm, Test, Frequency, Duration
│   ├── Primary Pump                # Arm/Disarm, Test, Duration
│   ├── Secondary Pump              # Arm/Disarm, Test, Duration
│   ├── Laser                       # Arm/Disarm, Test, Frequency, Duration, Contingent/Independent
│   ├── Lick Circuit                # Arm/Disarm
│   ├── Microscope                  # Arm/Disarm, Test
│   ├── ──── System ────
│   ├── Test Chain                  # Fire the full reward chain
│   ├── Test Mode On/Off            # Toggle test mode
│   └── Back
├── Program
│   ├── Apply Preset                # → Preset submenu
│   │   ├── SA High
│   │   ├── SA Mid
│   │   ├── SA Low
│   │   ├── SA Extinction
│   │   └── Back
│   ├── Paradigm Settings           # paradigm-aware: FR/PR Ratio, PR Step, VI/OM interval, Trace
│   ├── Pavlovian Settings          # (only when paradigm = pavlovian)
│   │   └── CS+/CS- counts, freqs, reward probs, cue duration, trace, ITI (validated), pulse on/off
│   ├── Limits                      # Limit type, time, infusion, delay
│   ├── Start / Stop / Pause        # (context-dependent)
│   └── Back
├── Monitor
│   ├── View Status                 # Show session state summary
│   ├── Live Stream                 # Enter MONITOR mode
│   └── Back
├── Data
│   ├── Set Filename                # Configure output filename
│   ├── Set Destination             # Configure output directory
│   ├── Set Notes                   # Add session notes
│   ├── Export ZIP                   # Export session data as ZIP
│   ├── View Data Preview           # Show recent behavioral events
│   └── Back
└── Quit
```

### Presets

Presets configure hardware, paradigm settings, and limits in a single action:

| Preset | Paradigm | Infusion Limit | Pump | Description |
|---|---|---|---|---|
| **SA High** | FR | 10 | Armed | High-dose self-administration |
| **SA Mid** | FR | 20 | Armed | Mid-dose self-administration |
| **SA Low** | FR | 40 | Armed | Low-dose self-administration |
| **SA Extinction** | FR | — | Disabled | Extinction (pump disarmed, time limit only) |

All presets use FR1 with 20s timeout, 8000 Hz cue, 1600 ms cue duration, 2000 ms pump duration, 3600s time limit, and 60s delay.

### Live Monitor

The Live Stream mode opens a WebSocket connection to the backend and displays events in real time:

- **Counters** — Infusions, presses, and session state displayed in the header
- **Event feed** — Scrolling tail of the last 30 events with timestamps
- **Elapsed timer** — Running elapsed time (paused time excluded)
- Press **Esc** to exit the monitor and return to the menu

### Architecture Summary

| Class | File | Purpose |
|---|---|---|
| `ReacherCLI` | `app.py` | Menu rendering, mode switching, key bindings, action dispatch |
| `ReacherClient` | `client.py` | Async HTTP wrapper around every REACHER REST endpoint |
| `SessionState` | `app.py` | Dataclass tracking session ID, state, counters, settings |
| `MenuItem` | `app.py` | Menu item with label, action callback, and optional suffix |
| `MenuState` | `app.py` | Menu page with title, items, selected index, and parent link |

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- [reacher](https://github.com/otis-lab-musc/reacher) package installed
- [avrdude](https://github.com/avrdudes/avrdude) (required for firmware upload in standalone builds)
  - Linux: `sudo apt-get install avrdude`
  - macOS: `brew install avrdude`
  - Windows: `choco install avrdude`

### Clone and initialize

```bash
git clone https://github.com/Otis-Lab-MUSC/labrynth.git
cd labrynth
pip install -e ../reacher   # or: pip install reacher2p  (ships firmware hex)
```

### Frontend development

```bash
# Build the frontend
cd web && npm ci && npm run build && cd ..

# Set env vars and run the server
export REACHER_STATIC_DIR=$(pwd)/web/dist
python -m reacher
# → Opens browser to http://localhost:6229
# Firmware hex comes from the installed reacher package; set REACHER_HEX_DIR
# only to override with a local hex tree.
```

### CLI development

```bash
pip install -e ".[cli]"
python -m cli
```

---

## Building a Standalone Executable

**Requires avrdude** to be installed (or passed via `--avrdude`). The build will exit with an error if avrdude cannot be found — see [Prerequisites](#prerequisites) for install instructions.

```bash
python build.py                          # Full build
python build.py --skip-frontend          # Skip npm build (use existing web/dist/)
python build.py --avrdude /usr/bin/avrdude  # Bundle specific avrdude binary
```

The build pipeline:
1. **Stage 0:** Validates environment (reacher package + its bundled firmware hex)
2. **Stage 1:** Builds React frontend (`npm ci && npm run build`)
3. **Stage 2:** Validates required assets exist
4. **Stage 3:** Runs PyInstaller with `labrynth.spec`
5. **Stage 4:** Reports output location

Firmware hex is sourced from the installed `reacher` package (`reacher/hex/<board>/`) — no compile or fetch step.

Output: `dist/Labrynth/` (Linux/Windows) or `dist/Labrynth.app` (macOS)

---

## Updating the Firmware

Firmware ships inside the `reacher` package. To pick up a newer firmware build, bump the `reacher2p` dependency pin with `python scripts/bump-version.py --reacher-pin <reacher-semver>` (it writes the PEP 440 form, e.g. `reacher2p>=3.0.0a1`) and reinstall. Firmware source and hex live in the [reacher](https://github.com/otis-lab-musc/reacher) repo under `firmware/` and `src/reacher/hex/`.

---

## Dependencies

### CLI (`[cli]` optional extra)

| Package | Version | Purpose |
|---|---|---|
| prompt_toolkit | >=3.0.0 | Terminal UI framework (menus, key bindings, rendering) |
| httpx | >=0.27.0 | Async HTTP client for backend API calls |
| websockets | >=12.0 | WebSocket client for live event streaming |

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contact

Joshua Boquiren — [thejoshbq@proton.me](mailto:thejoshbq@proton.me)

[GitHub: Otis-Lab-MUSC/labrynth](https://github.com/Otis-Lab-MUSC/labrynth)
