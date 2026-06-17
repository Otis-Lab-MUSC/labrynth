# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the standalone LabrynthCLI executable.

A console/TUI build for headless REACHER hosts (e.g. a display-less
Raspberry Pi). Unlike the GUI ``labrynth.spec`` it:
  - uses ``cli/__main__.py`` as the entry point,
  - builds a console app (prompt_toolkit needs a TTY),
  - does NOT bundle the React frontend (no ``static/``).

The frozen CLI re-launches itself as the backend via the
``REACHER_RUN_BACKEND`` trampoline in ``cli/__main__.py``.

Bundles:
  - Python backend (FastAPI + kernel + all deps)
  - Pre-compiled firmware  → _MEIPASS/hex/   (for firmware upload)
  - Platform avrdude       → _MEIPASS/avrdude/

Build:
  pyinstaller labrynth-cli.spec
"""

import os
import sys

from PyInstaller.utils.hooks import collect_submodules

# ---------------------------------------------------------------------------
# Paths — all relative to this spec file (which lives at the repo root)
# ---------------------------------------------------------------------------

SPEC_DIR = os.path.abspath(SPECPATH)
PROJECT_ROOT = SPEC_DIR

# Firmware hex ships as package data inside the installed reacher dependency.
# Resolve it via build.py's shared helper so spec and orchestrator agree.
sys.path.insert(0, SPEC_DIR)
from build import resolve_reacher_hex_dir  # noqa: E402

HEX_DIR = resolve_reacher_hex_dir()

# avrdude — default platform location; override via build.py --avrdude
AVRDUDE_PATH = os.environ.get("REACHER_AVRDUDE_PATH", "")

# ---------------------------------------------------------------------------
# Data files to bundle (no React frontend in the CLI build)
# ---------------------------------------------------------------------------

datas = []

# Firmware hex files (from the reacher package) → hex/
if HEX_DIR and os.path.isdir(HEX_DIR):
    datas.append((HEX_DIR, "hex"))
else:
    print(f"WARNING: reacher firmware hex directory not found (resolved: {HEX_DIR})")

# avrdude binary + companion DLLs + conf → avrdude/  (see labrynth.spec for why
# the executable + libraries go through ``binaries`` rather than ``datas``).
extra_binaries = []

if AVRDUDE_PATH and os.path.isfile(AVRDUDE_PATH):
    extra_binaries.append((AVRDUDE_PATH, "avrdude"))
    _avrdude_dir = os.path.dirname(AVRDUDE_PATH)

    for _f in os.listdir(_avrdude_dir):
        _fpath = os.path.join(_avrdude_dir, _f)
        if os.path.isfile(_fpath) and _f.lower().endswith((".dll", ".so", ".dylib")):
            extra_binaries.append((_fpath, "avrdude"))

    for _conf in [
        os.path.join(_avrdude_dir, "..", "etc", "avrdude.conf"),
        os.path.join(_avrdude_dir, "avrdude.conf"),
    ]:
        if os.path.isfile(_conf):
            datas.append((os.path.abspath(_conf), "avrdude"))
            break
else:
    extra_binaries = []
    print("NOTE: No avrdude binary bundled (set REACHER_AVRDUDE_PATH or use build.py --avrdude)")

# ---------------------------------------------------------------------------
# Hidden imports — uvicorn/pyserial internals (mirrors labrynth.spec) plus the
# CLI package and its deps, and the reacher backend entry the CLI re-spawns.
# ---------------------------------------------------------------------------

hiddenimports = [
    "uvicorn.logging",
    "uvicorn.lifespan.on",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "serial.tools.list_ports",
    "serial.tools.list_ports_common",
    "serial.tools.list_ports_windows",
    "serial.tools.list_ports_posix",
    "serial.tools.list_ports_linux",
    "serial.tools.list_ports_osx",
    # CLI package + its runtime dependencies
    "cli",
    "cli.app",
    "cli.client",
    "httpx",
    "websockets",
    # Backend entry the frozen CLI re-spawns as the server process
    "reacher.api.app",
]
# prompt_toolkit pulls in submodules dynamically; collect them all.
hiddenimports += collect_submodules("prompt_toolkit")

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

a = Analysis(
    [os.path.join(SPEC_DIR, "cli", "__main__.py")],
    pathex=[],
    binaries=extra_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="LabrynthCLI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # prompt_toolkit TUI needs a console/TTY
    icon=os.path.join(PROJECT_ROOT, "installer", "icons", "labrynth-icon.ico"),
)

# ---------------------------------------------------------------------------
# Output — a one-dir COLLECT on every platform (a console TUI must be launched
# from a terminal; a macOS .app BUNDLE launched from Finder has no TTY).
# ---------------------------------------------------------------------------

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="LabrynthCLI",
)
