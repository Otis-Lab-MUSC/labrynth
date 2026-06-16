#!/usr/bin/env python3
"""Cross-platform build orchestrator for Labrynth standalone packaging.

Orchestrates the full build pipeline:
  0. Validate environment (reacher package + its bundled firmware hex)
  1. Build React frontend (npm ci && npm run build)
  2. Validate required assets exist
  3. Run PyInstaller with labrynth.spec
  4. Report output location

Firmware hex files are no longer compiled or fetched here — they ship as
package data inside the ``reacher`` pip dependency (firmware source lives in
the reacher repo since reacher-firmware was archived). This build sources hex
straight from the installed reacher package, so the version is pinned by the
``reacher`` dependency in pyproject.toml.

Usage:
  python build.py                          # full build
  python build.py --skip-frontend          # skip npm build
  python build.py --avrdude /usr/bin/avrdude  # explicit avrdude path

Requires: Python 3.10+, Node.js, npm, PyInstaller (pip install pyinstaller),
and the reacher package installed (pip install reacher2p or -e ../reacher).
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import urllib.request

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = SCRIPT_DIR

FRONTEND_DIR = os.path.join(PROJECT_ROOT, "web")
FRONTEND_DIST = os.path.join(FRONTEND_DIR, "dist")
SPEC_FILE = os.path.join(SCRIPT_DIR, "labrynth.spec")

PARADIGMS = ("fr", "pr", "vi", "omission", "pavlovian")
BOARDS = ("uno", "mega")


def resolve_reacher_hex_dir():
    """Return the firmware hex directory shipped inside the installed reacher package.

    Firmware hex is package data at ``reacher/hex/<board>/<paradigm>.hex``.
    Returns the absolute path to that ``hex`` directory, or None if reacher is
    not importable or ships no hex tree. Shared by build.py (asset validation)
    and labrynth.spec (bundling) so both agree on the source of truth.
    """
    try:
        from importlib import resources

        hex_dir = resources.files("reacher") / "hex"
        path = os.fspath(hex_dir)
    except (ImportError, ModuleNotFoundError, AttributeError):
        return None
    return path if os.path.isdir(path) else None


def _run(cmd, cwd=None, env=None):
    """Run a command, streaming output. Exit on failure."""
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if result.returncode != 0:
        print(f"\nERROR: Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)


# ---------------------------------------------------------------------------
# Build stages
# ---------------------------------------------------------------------------

def validate_environment():
    """Verify reacher is installed and ships firmware hex as package data."""
    print("\n=== Stage 0: Validate environment ===")

    # Check reacher package
    try:
        import reacher
        version = getattr(reacher, "__version__", "unknown")
        print(f"  [OK] reacher package (v{version})")
    except ImportError:
        print("ERROR: reacher package not installed.")
        print("       Run: pip install -e ../reacher   (or: pip install reacher2p)")
        sys.exit(1)

    # Check the reacher package actually carries firmware hex
    hex_dir = resolve_reacher_hex_dir()
    if hex_dir:
        print(f"  [OK] Firmware hex (from reacher package): {hex_dir}")
    else:
        print("ERROR: reacher package ships no firmware hex (reacher/hex/).")
        print("       Reinstall reacher: pip install -e ../reacher")
        sys.exit(1)


def build_frontend():
    """Build the React frontend."""
    print("\n=== Stage 1: Build frontend ===")
    if not os.path.isfile(os.path.join(FRONTEND_DIR, "package.json")):
        print(f"ERROR: package.json not found at {FRONTEND_DIR}")
        sys.exit(1)

    npm = "npm.cmd" if platform.system() == "Windows" else "npm"
    _run([npm, "ci"], cwd=FRONTEND_DIR)
    _run([npm, "run", "build"], cwd=FRONTEND_DIR)


_AVRDUDE_VERSION = "8.1"
_AVRDUDE_MIN_SIZE = 100_000  # bytes — Chocolatey shims are ~24 KB, real binary is ~7 MB


def _ensure_real_avrdude(avrdude_path):
    """Return a path to a real avrdude binary, downloading one if necessary.

    On Windows, Chocolatey installs a small shim (~24 KB) instead of the
    real binary.  The shim breaks when relocated into a PyInstaller bundle.
    This function detects shims by file size and downloads the real avrdude
    from GitHub releases automatically.
    """
    # Happy path: the provided binary is real
    if avrdude_path and os.path.isfile(avrdude_path):
        if os.path.getsize(avrdude_path) >= _AVRDUDE_MIN_SIZE:
            return avrdude_path
        print(f"  [WARN] avrdude at {avrdude_path} is only "
              f"{os.path.getsize(avrdude_path):,} bytes (likely a shim)")

    # Only auto-download on Windows — Linux/macOS package managers install real binaries
    if platform.system() != "Windows":
        return avrdude_path

    # Check cache from a previous download
    dist_dir = os.path.join(PROJECT_ROOT, ".avrdude-dist")
    if os.path.isdir(dist_dir):
        for root, _dirs, files in os.walk(dist_dir):
            for f in files:
                if f.lower() == "avrdude.exe":
                    cached = os.path.join(root, f)
                    if os.path.getsize(cached) >= _AVRDUDE_MIN_SIZE:
                        print(f"  [OK] Using cached avrdude: {cached}")
                        return cached

    # Download avrdude from GitHub releases (MSVC build, statically linked, no DLLs)
    import zipfile

    asset = f"avrdude-v{_AVRDUDE_VERSION}-windows-x64.zip"
    url = f"https://github.com/avrdudes/avrdude/releases/download/v{_AVRDUDE_VERSION}/{asset}"
    zip_path = os.path.join(PROJECT_ROOT, asset)
    print(f"  [INFO] Downloading avrdude v{_AVRDUDE_VERSION} from {url}")
    try:
        urllib.request.urlretrieve(url, zip_path)
    except Exception as exc:
        print(f"  [ERROR] Failed to download avrdude: {exc}")
        return avrdude_path

    os.makedirs(dist_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dist_dir)
    os.remove(zip_path)

    for root, _dirs, files in os.walk(dist_dir):
        for f in files:
            if f.lower() == "avrdude.exe":
                real = os.path.join(root, f)
                if os.path.getsize(real) >= _AVRDUDE_MIN_SIZE:
                    print(f"  [OK] Downloaded avrdude: {real} "
                          f"({os.path.getsize(real):,} bytes)")
                    return real

    print("  [ERROR] avrdude.exe not found in downloaded archive")
    return avrdude_path


def validate_assets(avrdude_path):
    """Validate that all required assets exist before packaging."""
    print("\n=== Stage 2: Validate assets ===")
    ok = True

    # Frontend dist
    index_html = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_html):
        print(f"  [OK] Frontend dist: {FRONTEND_DIST}")
    else:
        print(f"  [MISSING] Frontend dist: {index_html}")
        ok = False

    # Hex files come from the installed reacher package (board-aware layout).
    hex_dir = resolve_reacher_hex_dir()
    if not hex_dir:
        print("  [MISSING] reacher package firmware hex (reacher/hex/)")
        ok = False
    else:
        for board in BOARDS:
            board_dir = os.path.join(hex_dir, board)
            board_hex = [p for p in PARADIGMS
                         if os.path.isfile(os.path.join(board_dir, f"{p}.hex"))]
            if board_hex:
                print(f"  [OK] Hex files ({board}): {', '.join(board_hex)}")
            else:
                print(f"  [WARN] No hex files found for {board} in {board_dir}")

    # avrdude — ensure we have a real binary, not a Chocolatey shim
    if avrdude_path and os.path.isfile(avrdude_path):
        avrdude_path = _ensure_real_avrdude(avrdude_path)
        print(f"  [OK] avrdude: {avrdude_path}")
    elif shutil.which("avrdude"):
        avrdude_path = _ensure_real_avrdude(shutil.which("avrdude"))
        print(f"  [OK] avrdude: {avrdude_path}")
    else:
        # No avrdude found — try downloading on Windows
        avrdude_path = _ensure_real_avrdude(None)
        if avrdude_path and os.path.isfile(avrdude_path):
            print(f"  [OK] avrdude (downloaded): {avrdude_path}")
        else:
            print("  [MISSING] avrdude — firmware upload won't work without it.")
            print("            Install avrdude or run on Windows to auto-download.")
            ok = False

    if not ok:
        print("\nERROR: Required assets missing. Fix the issues above or use --skip-* flags.")
        sys.exit(1)

    return avrdude_path


def run_pyinstaller(avrdude_path):
    """Run PyInstaller with the spec file."""
    print("\n=== Stage 3: Run PyInstaller ===")
    if not shutil.which("pyinstaller"):
        print("ERROR: pyinstaller not found. Install with: pip install pyinstaller")
        sys.exit(1)

    env = os.environ.copy()
    if avrdude_path:
        env["REACHER_AVRDUDE_PATH"] = avrdude_path

    _run(
        ["pyinstaller", "--noconfirm", "--clean", SPEC_FILE],
        cwd=PROJECT_ROOT,
        env=env,
    )


def report_output():
    """Report the location of the built artifact."""
    print("\n=== Stage 4: Build complete ===")
    system = platform.system()

    if system == "Darwin":
        app_path = os.path.join(SCRIPT_DIR, "dist", "Labrynth.app")
        if os.path.isdir(app_path):
            print(f"  Output: {app_path}")
            print(f"  Run:    open {app_path}")
            return
    elif system == "Windows":
        exe_path = os.path.join(SCRIPT_DIR, "dist", "Labrynth", "Labrynth.exe")
        if os.path.isfile(exe_path):
            print(f"  Output: {os.path.dirname(exe_path)}")
            print(f"  Run:    {exe_path}")
            return
    else:
        exe_path = os.path.join(SCRIPT_DIR, "dist", "Labrynth", "Labrynth")
        if os.path.isfile(exe_path):
            print(f"  Output: {os.path.dirname(exe_path)}")
            print(f"  Run:    {exe_path}")
            return

    # Fallback: just point to dist/
    dist_dir = os.path.join(SCRIPT_DIR, "dist")
    print(f"  Output: {dist_dir}")
    print("  Check the dist/ directory for built artifacts.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Build Labrynth standalone executable",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Example: python build.py --skip-frontend --avrdude /usr/bin/avrdude",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip npm build (use existing web/dist/)",
    )
    parser.add_argument(
        "--avrdude",
        metavar="PATH",
        default="",
        help="Explicit path to avrdude binary to bundle",
    )
    args = parser.parse_args()

    print("Labrynth Build Orchestrator")
    print(f"  Platform: {platform.system()} {platform.machine()}")
    print(f"  Python:   {sys.version.split()[0]}")
    print(f"  Project:  {PROJECT_ROOT}")

    # Stage 0: Validate (reacher package + its bundled firmware hex)
    validate_environment()

    # Stage 1: Frontend
    if args.skip_frontend:
        print("\n=== Stage 1: Build frontend [SKIPPED] ===")
    else:
        build_frontend()

    # Stage 2: Validate
    avrdude_path = validate_assets(args.avrdude)

    # Stage 3: PyInstaller
    run_pyinstaller(avrdude_path)

    # Stage 4: Report
    report_output()


if __name__ == "__main__":
    main()
