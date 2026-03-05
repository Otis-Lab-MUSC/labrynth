"""Entry point for PyInstaller-bundled Labrynth application."""
import os
import sys

_LABRYNTH_ROOT = os.path.dirname(os.path.abspath(__file__))
_STATIC_DIR = os.path.join(_LABRYNTH_ROOT, "web", "dist")
if os.path.isdir(_STATIC_DIR) and not os.environ.get("REACHER_STATIC_DIR"):
    os.environ["REACHER_STATIC_DIR"] = _STATIC_DIR

from reacher.api.app import main

if __name__ == "__main__":
    main()
