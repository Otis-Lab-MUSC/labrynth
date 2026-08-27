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
        # reacher's summarizer sends a raw ChatML prompt with --no-conversation.
        # Since llama.cpp b10622 that is llama-completion; llama-cli is
        # chat-only and rejects the flag.  Fall back to llama-cli so an older
        # bundle without llama-completion still resolves to something.
        _suffix = ".exe" if sys.platform == "win32" else ""
        if not os.environ.get("REACHER_LLM_BIN"):
            for _name in ("llama-completion", "llama-cli"):
                _bin = os.path.join(_llm_dir, _name + _suffix)
                if os.path.isfile(_bin):
                    os.environ["REACHER_LLM_BIN"] = _bin
                    break
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
    # find_spec raises rather than returning None when the *parent* package is
    # missing, which is exactly the "reacher not installed" case handled here.
    try:
        _have_reacher = importlib.util.find_spec("reacher.api") is not None
    except ImportError:
        _have_reacher = False
    if not _have_reacher:
        print(
            "ERROR: The `reacher` package is not installed. "
            "Run `pip install -e ../reacher` from the labrynth/ directory.",
            file=sys.stderr,
        )
        sys.exit(1)

    # A reacher older than the pin still starts and serves 200s while silently
    # lacking routers the frontend needs, so surface the mismatch rather than
    # letting a broken app look like a working one.  Never fatal.
    try:
        import re

        def _version_key(v):
            """Sortable key for semver/PEP 440 prereleases; stable outranks its prereleases."""
            m = re.match(r"^(\d+)\.(\d+)\.(\d+)(?:-?(alpha|beta|rc|a|b)\.?(\d+))?$", v)
            if not m:
                return None
            _major, _minor, _patch, _kind, _num = m.groups()
            _stage = {"a": 0, "alpha": 0, "b": 1, "beta": 1, "rc": 2}.get(_kind, 3)
            return (int(_major), int(_minor), int(_patch), _stage, int(_num or 0))

        with open(os.path.join(_LABRYNTH_ROOT, "pyproject.toml")) as _f:
            _pin = re.search(r'reacher2p>=([^"]+)"', _f.read()).group(1)
        import reacher
        _have, _want = _version_key(reacher.__version__), _version_key(_pin)
        if _have and _want and _have < _want:
            print(
                f"WARNING: reacher {reacher.__version__} is installed but this "
                f"Labrynth pins reacher2p>={_pin}.\n"
                "         The frontend may fail against an older backend.\n"
                "         Run `pip install -e ../reacher` from the labrynth/ directory.",
                file=sys.stderr,
            )
    except Exception:
        pass

from reacher.api.app import main

if __name__ == "__main__":
    main()
