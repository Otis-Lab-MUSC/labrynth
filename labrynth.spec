# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Labrynth standalone executable.

Bundles:
  - Python backend (FastAPI + kernel + all deps)
  - Built React frontend  → _MEIPASS/static/
  - Pre-compiled firmware  → _MEIPASS/hex/
  - Platform avrdude       → _MEIPASS/avrdude/

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
HEX_DIR = os.path.join(PROJECT_ROOT, "firmware", "hex")

# avrdude — default platform location; override via build.py --avrdude
AVRDUDE_PATH = os.environ.get("REACHER_AVRDUDE_PATH", "")

# ---------------------------------------------------------------------------
# Data files to bundle
# ---------------------------------------------------------------------------

datas = []

# React frontend → static/
if os.path.isdir(FRONTEND_DIST):
    datas.append((FRONTEND_DIST, "static"))
else:
    print(f"WARNING: Frontend dist not found at {FRONTEND_DIST}")

# Firmware hex files → hex/
if os.path.isdir(HEX_DIR):
    datas.append((HEX_DIR, "hex"))
else:
    print(f"WARNING: Hex directory not found at {HEX_DIR}")

# avrdude binary + conf → avrdude/
if AVRDUDE_PATH and os.path.isfile(AVRDUDE_PATH):
    datas.append((AVRDUDE_PATH, "avrdude"))
    # Also bundle avrdude.conf if present alongside the binary
    _avrdude_dir = os.path.dirname(AVRDUDE_PATH)
    for _conf in [
        os.path.join(_avrdude_dir, "..", "etc", "avrdude.conf"),
        os.path.join(_avrdude_dir, "avrdude.conf"),
    ]:
        if os.path.isfile(_conf):
            datas.append((os.path.abspath(_conf), "avrdude"))
            break
else:
    print("NOTE: No avrdude binary bundled (set REACHER_AVRDUDE_PATH or use build.py --avrdude)")

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
]

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

a = Analysis(
    [os.path.join(SPEC_DIR, "launcher.py")],
    pathex=[],
    binaries=[],
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
