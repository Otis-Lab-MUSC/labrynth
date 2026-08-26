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

# Frozen GUI builds ship llama-cli + GGUF under _MEIPASS/llm/.  Point the
# reacher report endpoint at them unless the operator overrode the env.
if hasattr(sys, "_MEIPASS"):
    _llm_dir = os.path.join(sys._MEIPASS, "llm")
    if os.path.isdir(_llm_dir):
        os.environ["PATH"] = _llm_dir + os.pathsep + os.environ.get("PATH", "")
        if sys.platform == "linux":
            os.environ["LD_LIBRARY_PATH"] = (
                _llm_dir + os.pathsep + os.environ.get("LD_LIBRARY_PATH", "")
            )
        elif sys.platform == "darwin":
            os.environ["DYLD_LIBRARY_PATH"] = (
                _llm_dir + os.pathsep + os.environ.get("DYLD_LIBRARY_PATH", "")
            )
        _exe = "llama-cli.exe" if sys.platform == "win32" else "llama-cli"
        _bin = os.path.join(_llm_dir, _exe)
        if os.path.isfile(_bin) and not os.environ.get("REACHER_LLM_BIN"):
            os.environ["REACHER_LLM_BIN"] = _bin
        if not os.environ.get("REACHER_LLM_MODEL"):
            for _name in os.listdir(_llm_dir):
                if _name.endswith(".gguf"):
                    os.environ["REACHER_LLM_MODEL"] = os.path.join(_llm_dir, _name)
                    break

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
