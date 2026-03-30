#!/usr/bin/env python3
"""Cross-platform build orchestrator for Labrynth standalone packaging.

Orchestrates the full build pipeline:
  0. Validate environment (submodule + reacher package)
  1. (Optional) Compile firmware hex files via compile.sh
  2. Build React frontend (npm ci && npm run build)
  3. Validate required assets exist
  4. Run PyInstaller with reacher.spec
  5. Report output location

Usage:
  python build.py                          # full build
  python build.py --skip-firmware          # skip hex compilation
  python build.py --skip-frontend          # skip npm build
  python build.py --avrdude /usr/bin/avrdude  # explicit avrdude path

Requires: Python 3.10+, Node.js, npm, PyInstaller (pip install pyinstaller)
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

FIRMWARE_DIR = os.path.join(PROJECT_ROOT, "firmware")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "web")
HEX_DIR = os.path.join(FIRMWARE_DIR, "hex")
FRONTEND_DIST = os.path.join(FRONTEND_DIR, "dist")
SPEC_FILE = os.path.join(SCRIPT_DIR, "reacher.spec")

PARADIGMS = ("fr", "pr", "vi", "omission", "pavlovian")
FIRMWARE_REPO = "Otis-Lab-MUSC/reacher-firmware"
FIRMWARE_BRANCH = "develop"  # Will migrate to "main" in a future pass
FIRMWARE_RAW_BASE = f"https://raw.githubusercontent.com/{FIRMWARE_REPO}/{FIRMWARE_BRANCH}/hex"

PARADIGM_TO_SKETCH = {
    "fr": "fr",
    "pr": "pr",
    "vi": "vi",
    "omission": "omission",
    "pavlovian": "pavlovian",
}
BOARDS = ("uno", "mega")


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

def validate_environment(fetch_firmware_flag: bool = False):
    """Verify submodules are initialized and reacher is installed."""
    print("\n=== Stage 0: Validate environment ===")

    # Check firmware submodule
    if not os.path.isfile(os.path.join(FIRMWARE_DIR, "compile.sh")):
        if fetch_firmware_flag:
            print("  [WARN] firmware/ submodule not initialized — will fetch from GitHub instead.")
        else:
            print("ERROR: firmware/ submodule not initialized.")
            print("       Run: git submodule update --init --recursive")
            print("       Or:  python build.py --fetch-firmware")
            sys.exit(1)
    else:
        print("  [OK] Firmware submodule")

    # Check reacher package
    try:
        import reacher
        print(f"  [OK] reacher package (v{reacher.__version__ if hasattr(reacher, '__version__') else 'unknown'})")
    except ImportError:
        print("ERROR: reacher package not installed.")
        print("       Run: pip install -e /path/to/reacher")
        sys.exit(1)


def fetch_firmware():
    """Download pre-compiled hex files from the reacher-firmware GitHub repository.

    Fetches from the ``develop`` branch of Otis-Lab-MUSC/reacher-firmware using
    raw.githubusercontent.com (no rate limits, no auth required).  Files are
    written to ``firmware/hex/{board}/{paradigm}.hex``.
    """
    print(f"\n=== Stage 1: Fetch firmware from GitHub ({FIRMWARE_BRANCH} branch) ===")
    errors = []
    for board in BOARDS:
        board_dir = os.path.join(HEX_DIR, board)
        os.makedirs(board_dir, exist_ok=True)
        for paradigm in PARADIGMS:
            sketch = PARADIGM_TO_SKETCH[paradigm]
            url = f"{FIRMWARE_RAW_BASE}/{board}/{sketch}.hex"
            dest = os.path.join(board_dir, f"{sketch}.hex")
            print(f"  Fetching {board}/{sketch}.hex ...", end=" ", flush=True)
            try:
                urllib.request.urlretrieve(url, dest)
                print("OK")
            except Exception as exc:
                print(f"FAILED ({exc})")
                errors.append((board, paradigm, str(exc)))

    if errors:
        print(f"\nWARNING: {len(errors)} hex file(s) could not be fetched:")
        for board, paradigm, reason in errors:
            print(f"  {board}/{paradigm}: {reason}")
        if len(errors) == len(PARADIGMS) * len(BOARDS):
            print("ERROR: No hex files could be fetched. Check network connectivity.")
            sys.exit(1)
    else:
        print(f"  [OK] All hex files fetched to {HEX_DIR}")


def compile_firmware():
    """Compile firmware hex files via compile.sh."""
    print("\n=== Stage 1: Compile firmware ===")
    compile_script = os.path.join(FIRMWARE_DIR, "compile.sh")
    if not os.path.isfile(compile_script):
        print(f"ERROR: compile.sh not found at {compile_script}")
        sys.exit(1)

    if platform.system() == "Windows":
        # On Windows, try git-bash or WSL
        git_bash = shutil.which("bash")
        if git_bash:
            _run([git_bash, compile_script], cwd=FIRMWARE_DIR)
        else:
            print("ERROR: bash not found — cannot run compile.sh on Windows")
            print("       Install Git for Windows or use --skip-firmware")
            sys.exit(1)
    else:
        _run(["bash", compile_script], cwd=FIRMWARE_DIR)


def build_frontend():
    """Build the React frontend."""
    print("\n=== Stage 2: Build frontend ===")
    if not os.path.isfile(os.path.join(FRONTEND_DIR, "package.json")):
        print(f"ERROR: package.json not found at {FRONTEND_DIR}")
        sys.exit(1)

    npm = "npm.cmd" if platform.system() == "Windows" else "npm"
    _run([npm, "ci"], cwd=FRONTEND_DIR)
    _run([npm, "run", "build"], cwd=FRONTEND_DIR)


def validate_assets(avrdude_path):
    """Validate that all required assets exist before packaging."""
    print("\n=== Stage 3: Validate assets ===")
    ok = True

    # Frontend dist
    index_html = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_html):
        print(f"  [OK] Frontend dist: {FRONTEND_DIST}")
    else:
        print(f"  [MISSING] Frontend dist: {index_html}")
        ok = False

    # Hex files (board-aware subdirectory layout)
    for board in BOARDS:
        board_hex = []
        board_dir = os.path.join(HEX_DIR, board)
        for p in PARADIGMS:
            sketch = PARADIGM_TO_SKETCH[p]
            path = os.path.join(board_dir, f"{sketch}.hex")
            if os.path.isfile(path):
                board_hex.append(p)
        if board_hex:
            print(f"  [OK] Hex files ({board}): {', '.join(board_hex)}")
        else:
            # Fallback: check flat layout for uno only
            if board == "uno":
                flat_found = [p for p in PARADIGMS
                              if os.path.isfile(os.path.join(HEX_DIR, f"{PARADIGM_TO_SKETCH[p]}.hex"))]
                if flat_found:
                    print(f"  [WARN] Hex files ({board}): using deprecated flat layout — "
                          f"migrate to hex/{board}/. Found: {', '.join(flat_found)}")
                else:
                    print(f"  [WARN] No hex files found for {board}")
            else:
                print(f"  [WARN] No hex files found for {board} in {board_dir}")

    # avrdude
    if avrdude_path and os.path.isfile(avrdude_path):
        print(f"  [OK] avrdude: {avrdude_path}")
    elif shutil.which("avrdude"):
        found = shutil.which("avrdude")
        print(f"  [OK] avrdude (system): {found}")
        avrdude_path = found
    else:
        print("  [WARN] avrdude not found — upload feature won't work in bundle")

    if not ok:
        print("\nERROR: Required assets missing. Fix the issues above or use --skip-* flags.")
        sys.exit(1)

    return avrdude_path


def run_pyinstaller(avrdude_path):
    """Run PyInstaller with the spec file."""
    print("\n=== Stage 4: Run PyInstaller ===")
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
    print("\n=== Stage 5: Build complete ===")
    system = platform.system()

    if system == "Darwin":
        app_path = os.path.join(SCRIPT_DIR, "dist", "REACHER.app")
        if os.path.isdir(app_path):
            print(f"  Output: {app_path}")
            print(f"  Run:    open {app_path}")
            return
    elif system == "Windows":
        exe_path = os.path.join(SCRIPT_DIR, "dist", "REACHER", "REACHER.exe")
        if os.path.isfile(exe_path):
            print(f"  Output: {os.path.dirname(exe_path)}")
            print(f"  Run:    {exe_path}")
            return
    else:
        exe_path = os.path.join(SCRIPT_DIR, "dist", "REACHER", "REACHER")
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
        epilog="Example: python build.py --skip-firmware --avrdude /usr/bin/avrdude",
    )
    parser.add_argument(
        "--skip-firmware",
        action="store_true",
        help="Skip firmware hex compilation (use existing hex files)",
    )
    parser.add_argument(
        "--fetch-firmware",
        action="store_true",
        help=f"Fetch pre-compiled hex files from GitHub ({FIRMWARE_REPO}@{FIRMWARE_BRANCH}) instead of compiling locally",
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

    # Stage 0: Validate
    validate_environment(fetch_firmware_flag=args.fetch_firmware)

    # Stage 1: Firmware
    if args.skip_firmware:
        print("\n=== Stage 1: Compile firmware [SKIPPED] ===")
    elif args.fetch_firmware:
        fetch_firmware()
    elif not os.path.isfile(os.path.join(FIRMWARE_DIR, "compile.sh")):
        # Submodule absent and no explicit flag — auto-fall back to GitHub fetch
        print("\n  [INFO] Firmware submodule absent; auto-fetching from GitHub.")
        fetch_firmware()
    else:
        compile_firmware()

    # Stage 2: Frontend
    if args.skip_frontend:
        print("\n=== Stage 2: Build frontend [SKIPPED] ===")
    else:
        build_frontend()

    # Stage 3: Validate
    avrdude_path = validate_assets(args.avrdude)

    # Stage 4: PyInstaller
    run_pyinstaller(avrdude_path)

    # Stage 5: Report
    report_output()


if __name__ == "__main__":
    main()
