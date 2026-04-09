# Labrynth — Application Shell

**Build orchestrator, React frontend, and terminal CLI for the REACHER ecosystem**

[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://github.com/Otis-Lab-MUSC/labrynth)
[![Python](https://img.shields.io/badge/python-3.10+-blue)](https://www.python.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![REACHER Suite](https://img.shields.io/badge/REACHER_Suite-member-orange)](https://github.com/Otis-Lab-MUSC)

*Written by*: Joshua Boquiren

[![](https://img.shields.io/badge/@thejoshbq-grey?style=flat&logo=github)](https://github.com/thejoshbq)

---

## Overview

**Labrynth** is the application shell for the [REACHER](https://github.com/otis-lab-musc/reacher) ecosystem. It bundles:

- A **React 19 + TypeScript frontend** (Vite + Tailwind CSS) for browser-based experiment control
- A **terminal CLI** (`cli/`) using prompt_toolkit for arrow-key navigable menus, text prompts, and live WebSocket event streaming
- A **build pipeline** (`build.py`) that compiles firmware, builds the frontend, and packages everything into a standalone executable via PyInstaller
- A **firmware submodule** linking to [reacher-firmware](https://github.com/otis-lab-musc/reacher-firmware) for pre-compiled hex files

The Python backend ([reacher](https://github.com/otis-lab-musc/reacher)) is installed as a pip dependency.

---

## Architecture

```
labrynth/
├── web/                    # React 19 + TypeScript + Vite + Tailwind frontend
├── cli/                    # Terminal CLI (prompt_toolkit)
│   ├── __main__.py         # Entry point, auto-start logic
│   ├── app.py              # ReacherCLI — menus, rendering, actions
│   └── client.py           # ReacherClient — async HTTP wrapper
├── firmware/               # Git submodule → reacher-firmware (hex files)
├── build.py                # Build orchestrator (firmware → frontend → PyInstaller)
├── labrynth.spec           # PyInstaller spec file
├── launcher.py             # Thin entry point for PyInstaller
└── pyproject.toml          # Build dependencies
```

**Dependency flow:**
```
labrynth ──pip install──→ reacher (Python library)
labrynth ──pip install──→ prompt_toolkit, httpx, websockets (CLI deps)
labrynth ──git submodule──→ reacher-firmware (hex files)
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
│   ├── Paradigm Settings           # Ratio, Step, VI/OM interval, Trace interval
│   ├── Pavlovian Settings          # (only when paradigm = pavlovian)
│   │   └── CS+/CS- counts, frequencies, reward probs, cue duration, trace, ITI
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
git submodule update --init --recursive
pip install -e /path/to/reacher
```

### Frontend development

```bash
# Build the frontend
cd web && npm ci && npm run build && cd ..

# Set env vars and run the server
export REACHER_STATIC_DIR=$(pwd)/web/dist
export REACHER_HEX_DIR=$(pwd)/firmware/hex
python -m reacher
# → Opens browser to http://localhost:6229
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
python build.py --skip-firmware          # Skip hex compilation (use existing)
python build.py --skip-frontend          # Skip npm build (use existing web/dist/)
python build.py --avrdude /usr/bin/avrdude  # Bundle specific avrdude binary
```

The build pipeline:
1. **Stage 0:** Validates environment (submodule + reacher package)
2. **Stage 1:** Compiles firmware hex files via `compile.sh`
3. **Stage 2:** Builds React frontend (`npm ci && npm run build`)
4. **Stage 3:** Validates required assets exist
5. **Stage 4:** Runs PyInstaller with `labrynth.spec`
6. **Stage 5:** Reports output location

Output: `dist/Labrynth/` (Linux/Windows) or `dist/Labrynth.app` (macOS)

---

## Updating the Firmware Submodule

When [reacher-firmware](https://github.com/otis-lab-musc/reacher-firmware) is updated:

```bash
cd firmware && git pull origin main && cd ..
git add firmware
git commit -m "Bump firmware submodule"
```

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
