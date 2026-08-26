# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Labrynth standalone executable.

Bundles:
  - Python backend (FastAPI + kernel + all deps)
  - Built React frontend  → _MEIPASS/static/
  - Pre-compiled firmware  → _MEIPASS/hex/
  - Platform avrdude       → _MEIPASS/avrdude/
  - llama.cpp + GGUF       → _MEIPASS/llm/  (GUI only)

Build:
  pyinstaller labrynth.spec
"""

import os
import platform
import sys

# ---------------------------------------------------------------------------
# Paths — all relative to this spec file (which lives at the repo root)
# ---------------------------------------------------------------------------

SPEC_DIR = os.path.abspath(SPECPATH)
PROJECT_ROOT = SPEC_DIR

FRONTEND_DIST = os.path.join(PROJECT_ROOT, "web", "dist")

# Firmware hex ships as package data inside the installed reacher dependency
# (firmware source moved into the reacher repo when reacher-firmware was
# archived). Resolve it via build.py's shared helper so spec and orchestrator
# agree on the source of truth.
sys.path.insert(0, SPEC_DIR)
from build import resolve_reacher_hex_dir  # noqa: E402

HEX_DIR = resolve_reacher_hex_dir()

# avrdude — default platform location; override via build.py --avrdude
AVRDUDE_PATH = os.environ.get("REACHER_AVRDUDE_PATH", "")

# llama.cpp + GGUF — set by build.py (GUI spec only; CLI spec never reads these)
LLM_BIN = os.environ.get("REACHER_LLM_BIN", "")
LLM_MODEL = os.environ.get("REACHER_LLM_MODEL", "")

# ---------------------------------------------------------------------------
# Data files to bundle
# ---------------------------------------------------------------------------

datas = []

# React frontend → static/
if os.path.isdir(FRONTEND_DIST):
    datas.append((FRONTEND_DIST, "static"))
else:
    print(f"WARNING: Frontend dist not found at {FRONTEND_DIST}")

# Firmware hex files (from the reacher package) → hex/
if HEX_DIR and os.path.isdir(HEX_DIR):
    datas.append((HEX_DIR, "hex"))
else:
    print(f"WARNING: reacher firmware hex directory not found (resolved: {HEX_DIR})")

# avrdude binary + companion DLLs + conf → avrdude/
#
# Using ``extra_binaries`` (not ``datas``) for the executable and DLLs so
# PyInstaller resolves their dynamic-library dependencies.  On Windows,
# avrdude.exe typically needs libusb0.dll or similar — ``datas`` would copy
# the file verbatim without analysing imports, causing avrdude to crash
# with exit code -1 at runtime.
extra_binaries = []

if AVRDUDE_PATH and os.path.isfile(AVRDUDE_PATH):
    extra_binaries.append((AVRDUDE_PATH, "avrdude"))
    _avrdude_dir = os.path.dirname(AVRDUDE_PATH)

    # Bundle companion DLLs that live alongside the avrdude binary
    for _f in os.listdir(_avrdude_dir):
        _fpath = os.path.join(_avrdude_dir, _f)
        if os.path.isfile(_fpath) and _f.lower().endswith((".dll", ".so", ".dylib")):
            extra_binaries.append((_fpath, "avrdude"))

    # Bundle avrdude.conf as data (not a binary)
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

# llama-cli + companion libs → llm/; GGUF as data in the same folder
if LLM_BIN and os.path.isfile(LLM_BIN):
    extra_binaries.append((LLM_BIN, "llm"))
    _llm_dir = os.path.dirname(LLM_BIN)
    for _f in os.listdir(_llm_dir):
        _fpath = os.path.join(_llm_dir, _f)
        if os.path.isfile(_fpath) and _f.lower().endswith((".dll", ".so", ".dylib")):
            extra_binaries.append((_fpath, "llm"))
else:
    print("NOTE: No llama-cli bundled (set REACHER_LLM_BIN or omit --skip-llm)")

if LLM_MODEL and os.path.isfile(LLM_MODEL):
    datas.append((LLM_MODEL, "llm"))
else:
    print("NOTE: No GGUF bundled (set REACHER_LLM_MODEL or omit --skip-llm)")

# ---------------------------------------------------------------------------
# Hidden imports — uvicorn internals that PyInstaller cannot detect
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
    # pyserial platform dispatchers are hidden behind runtime `if sys.platform`
    # guards in list_ports.py — PyInstaller's static tracer skips them.
    # List all variants so the correct module is present on every build target.
    "serial.tools.list_ports",
    "serial.tools.list_ports_common",
    "serial.tools.list_ports_windows",
    "serial.tools.list_ports_posix",
    "serial.tools.list_ports_linux",
    "serial.tools.list_ports_osx",
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

a = Analysis(
    [os.path.join(SPEC_DIR, "launcher.py")],
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
    name="Labrynth",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=os.path.join(PROJECT_ROOT, "installer", "icons", "labrynth-icon.ico"),
)

# ---------------------------------------------------------------------------
# Platform-specific output
# ---------------------------------------------------------------------------

if platform.system() == "Darwin":
    app = BUNDLE(
        exe,
        a.binaries,
        a.datas,
        name="Labrynth.app",
        icon=os.path.join(PROJECT_ROOT, "web", "public", "reacher-icon.png"),
        bundle_identifier="com.otislab.labrynth",
    )
else:
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        strip=False,
        upx=True,
        upx_exclude=[],
        name="Labrynth",
    )
