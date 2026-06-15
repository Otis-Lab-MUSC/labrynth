"""Entry point for PyInstaller-bundled Labrynth application."""
import os
import sys

_LABRYNTH_ROOT = os.path.dirname(os.path.abspath(__file__))
# In a frozen PyInstaller build _MEIPASS/static holds the React dist;
# in dev the frontend lives at web/dist relative to the repo root.
if hasattr(sys, "_MEIPASS"):
    _STATIC_DIR = os.path.join(sys._MEIPASS, "static")
else:
    _STATIC_DIR = os.path.join(_LABRYNTH_ROOT, "web", "dist")
    if not os.path.isdir(_STATIC_DIR) and not os.environ.get("REACHER_STATIC_DIR"):
        print(
            f"WARNING: web/dist not found at {_STATIC_DIR}. "
            "Run `npm run build` inside labrynth/web/ or set "
            "REACHER_STATIC_DIR to an existing dist directory.",
            file=sys.stderr,
        )
if os.path.isdir(_STATIC_DIR) and not os.environ.get("REACHER_STATIC_DIR"):
    os.environ["REACHER_STATIC_DIR"] = _STATIC_DIR

# Propagate --incognito / -i flag so app.py opens the browser in private mode.
if "--incognito" in sys.argv or "-i" in sys.argv:
    os.environ["REACHER_INCOGNITO"] = "1"

if not hasattr(sys, "_MEIPASS"):
    import importlib.util
    if importlib.util.find_spec("reacher.api") is None:
        print(
            "ERROR: The `reacher` package is not installed. "
            "Run `pip install -e ../reacher` from the labrynth/ directory.",
            file=sys.stderr,
        )
        sys.exit(1)

from reacher.api.app import main

if __name__ == "__main__":
    main()
