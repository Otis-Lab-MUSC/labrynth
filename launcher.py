"""Entry point for PyInstaller-bundled Labrynth application."""
import os
import sys

_LABRYNTH_ROOT = os.path.dirname(os.path.abspath(__file__))
_STATIC_DIR = os.path.join(_LABRYNTH_ROOT, "web", "dist")
if os.path.isdir(_STATIC_DIR) and not os.environ.get("REACHER_STATIC_DIR"):
    os.environ["REACHER_STATIC_DIR"] = _STATIC_DIR

# Propagate --incognito / -i flag so app.py opens the browser in private mode.
if "--incognito" in sys.argv or "-i" in sys.argv:
    os.environ["REACHER_INCOGNITO"] = "1"

from reacher.api.app import main

if __name__ == "__main__":
    main()
