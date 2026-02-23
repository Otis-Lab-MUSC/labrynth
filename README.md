# The Labrynth

**REACHER application shell — build orchestrator and React frontend**

[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://github.com/Otis-Lab-MUSC/labrynth)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

*Written by*: Joshua Boquiren

[![](https://img.shields.io/badge/@thejoshbq-grey?style=flat&logo=github)](https://github.com/thejoshbq)

---

## Overview

**The Labrynth** is the application shell for the [REACHER](https://github.com/otis-lab-musc/reacher) ecosystem. It bundles:

- A **React 19 + TypeScript frontend** (Vite + Tailwind CSS) for browser-based experiment control
- A **build pipeline** (`build.py`) that compiles firmware, builds the frontend, and packages everything into a standalone executable via PyInstaller
- A **firmware submodule** linking to [reacher-firmware](https://github.com/otis-lab-musc/reacher-firmware) for pre-compiled hex files

The Python backend ([reacher](https://github.com/otis-lab-musc/reacher)) is installed as a pip dependency.

---

## Architecture

```
labrynth/
├── web/                    # React 19 + TypeScript + Vite + Tailwind frontend
├── firmware/               # Git submodule → reacher-firmware (hex files)
├── build.py                # Build orchestrator (firmware → frontend → PyInstaller)
├── reacher.spec            # PyInstaller spec file
├── launcher.py             # Thin entry point for PyInstaller
└── pyproject.toml          # Build dependencies
```

**Dependency flow:**
```
labrynth ──pip install──→ reacher (Python library)
labrynth ──git submodule──→ reacher-firmware (hex files)
```

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- [reacher](https://github.com/otis-lab-musc/reacher) package installed

### Clone and initialize

```bash
git clone https://github.com/Otis-Lab-MUSC/labrynth.git
cd labrynth
git submodule update --init --recursive
pip install -e /path/to/reacher
```

### Development

```bash
# Build the frontend
cd web && npm ci && npm run build && cd ..

# Set env vars and run the server
export REACHER_STATIC_DIR=$(pwd)/web/dist
export REACHER_HEX_DIR=$(pwd)/firmware/hex
python -m reacher
# → Opens browser to http://localhost:6229
```

---

## Building a Standalone Executable

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
5. **Stage 4:** Runs PyInstaller with `reacher.spec`
6. **Stage 5:** Reports output location

Output: `dist/REACHER/` (Linux/Windows) or `dist/REACHER.app` (macOS)

---

## Updating the Firmware Submodule

When [reacher-firmware](https://github.com/otis-lab-musc/reacher-firmware) is updated:

```bash
cd firmware && git pull origin main && cd ..
git add firmware
git commit -m "Bump firmware submodule"
```

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contact

Joshua Boquiren — [thejoshbq@proton.me](mailto:thejoshbq@proton.me)

[GitHub: Otis-Lab-MUSC/labrynth](https://github.com/Otis-Lab-MUSC/labrynth)
