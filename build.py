#!/usr/bin/env python3
"""Cross-platform build orchestrator for Labrynth standalone packaging.

Orchestrates the full build pipeline:
  0. Validate environment (reacher package + its bundled firmware hex)
  1. Build React frontend (npm ci && npm run build)
  2. Validate required assets exist
  3. Run PyInstaller with labrynth.spec
  4. Report output location

Firmware hex files are not compiled or fetched here. They ship as package data
inside the ``reacher`` pip dependency, and this build sources hex straight from
the installed reacher package, so the version is pinned by the ``reacher``
dependency in pyproject.toml.

Usage:
  python build.py                          # full GUI build
  python build.py --skip-frontend          # skip npm build
  python build.py --avrdude /usr/bin/avrdude  # explicit avrdude path
  python build.py --skip-llm               # skip llama.cpp + GGUF (faster local GUI builds)
  python build.py --cli                    # build GUI + LabrynthCLI console app
  python build.py --cli-only               # build only LabrynthCLI (no frontend)

Requires: Python 3.10+, Node.js, npm, PyInstaller (pip install pyinstaller),
and the reacher package installed (pip install reacher2p or -e ../reacher).
Building the CLI also requires the ``[cli]`` extras: pip install -e ".[cli]".
"""

from __future__ import annotations

import argparse
import logging
import os
import platform
import shutil
import subprocess
import sys

from build_args import parse_arguments
from build_assets import (
    check_avrdude_conf,
    check_frontend_dist,
    check_hex_files,
    locate_avrdude,
    resolve_reacher_hex_dir,
)
from build_avrdude import resolve_avrdude_conf
from build_llm import ensure_llm, is_shared_lib, llama_binaries

# Names the PyInstaller specs and CI import from ``build``.
__all__ = [
    "ensure_llm",
    "is_shared_lib",
    "llama_binaries",
    "resolve_avrdude_conf",
    "resolve_reacher_hex_dir",
]

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = SCRIPT_DIR

FRONTEND_DIR = os.path.join(PROJECT_ROOT, "web")
FRONTEND_DIST = os.path.join(FRONTEND_DIR, "dist")
SPEC_FILE = os.path.join(SCRIPT_DIR, "labrynth.spec")
SPEC_FILE_CLI = os.path.join(SCRIPT_DIR, "labrynth-cli.spec")

CLI_MODULES = ("prompt_toolkit", "httpx", "websockets")
GUI_BUNDLE_NAME = "Labrynth"
CLI_BUNDLE_NAME = "LabrynthCLI"


def _run(
    cmd: list[str], cwd: str | None = None, env: dict[str, str] | None = None
) -> None:
    """Run a command, streaming output. Exit on failure."""
    logger.info(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if result.returncode != 0:
        logger.error(f"\nERROR: Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)


# ---------------------------------------------------------------------------
# Build stages
# ---------------------------------------------------------------------------

def validate_reacher_package() -> None:
    """Exit unless the reacher package is importable."""
    try:
        import reacher
    except ImportError:
        logger.error("ERROR: reacher package not installed.")
        logger.error("       Run: pip install -e ../reacher   (or: pip install reacher2p)")
        sys.exit(1)
    version = getattr(reacher, "__version__", "unknown")
    logger.info(f"  [OK] reacher package (v{version})")


def validate_environment() -> None:
    """Verify reacher is installed and ships firmware hex as package data."""
    logger.info("\n=== Stage 0: Validate environment ===")
    validate_reacher_package()

    hex_dir = resolve_reacher_hex_dir()
    if not hex_dir:
        logger.error("ERROR: reacher package ships no firmware hex (reacher/hex/).")
        logger.error("       Reinstall reacher: pip install -e ../reacher")
        sys.exit(1)
    logger.info(f"  [OK] Firmware hex (from reacher package): {hex_dir}")


def validate_cli_deps() -> None:
    """Verify the [cli] extras are importable so PyInstaller can bundle them."""
    logger.info("\n=== Stage 0b: Validate CLI dependencies ===")
    missing = []
    for mod in CLI_MODULES:
        try:
            __import__(mod)
            logger.info(f"  [OK] {mod}")
        except ImportError:
            missing.append(mod)
    if missing:
        logger.error(f"ERROR: CLI dependencies not importable: {', '.join(missing)}")
        logger.error('       Run: pip install -e ".[cli]"')
        sys.exit(1)


def build_frontend() -> None:
    """Build the React frontend."""
    logger.info("\n=== Stage 1: Build frontend ===")
    if not os.path.isfile(os.path.join(FRONTEND_DIR, "package.json")):
        logger.error(f"ERROR: package.json not found at {FRONTEND_DIR}")
        sys.exit(1)

    npm = "npm.cmd" if platform.system() == "Windows" else "npm"
    _run([npm, "ci"], cwd=FRONTEND_DIR)
    _run([npm, "run", "build"], cwd=FRONTEND_DIR)


def validate_assets(avrdude_path: str | None, require_frontend: bool = True) -> str | None:
    """Validate that all required assets exist before packaging."""
    logger.info("\n=== Stage 2: Validate assets ===")
    # The CLI-only build ships no static/, so it skips the frontend check.
    frontend_ok = check_frontend_dist() if require_frontend else True
    hex_ok = check_hex_files()
    avrdude_path, avrdude_ok = locate_avrdude(avrdude_path)
    conf_ok = check_avrdude_conf(avrdude_path)

    if not (frontend_ok and hex_ok and avrdude_ok and conf_ok):
        logger.error("\nERROR: Required assets missing. Fix the issues above or use --skip-* flags.")
        sys.exit(1)

    return avrdude_path


def run_pyinstaller(
    avrdude_path: str | None,
    spec_file: str = SPEC_FILE,
    llm_bin: str | None = None,
    llm_model: str | None = None,
) -> None:
    """Run PyInstaller with the given spec file."""
    logger.info(f"\n=== Stage 3: Run PyInstaller ({os.path.basename(spec_file)}) ===")
    if not shutil.which("pyinstaller"):
        logger.error("ERROR: pyinstaller not found. Install with: pip install pyinstaller")
        sys.exit(1)

    env = os.environ.copy()
    if avrdude_path:
        env["REACHER_AVRDUDE_PATH"] = avrdude_path
    if llm_bin:
        env["REACHER_LLM_BIN"] = llm_bin
    if llm_model:
        env["REACHER_LLM_MODEL"] = llm_model

    _run(
        ["pyinstaller", "--noconfirm", "--clean", spec_file],
        cwd=PROJECT_ROOT,
        env=env,
    )


def report_output(name: str = GUI_BUNDLE_NAME) -> None:
    """Report the location of a built artifact (GUI ``Labrynth`` or ``LabrynthCLI``)."""
    logger.info(f"\n=== Stage 4: Build complete ({name}) ===")
    dist_root = os.path.join(SCRIPT_DIR, "dist")
    system = platform.system()

    if system == "Darwin":
        app_path = os.path.join(dist_root, f"{name}.app")
        if os.path.isdir(app_path):
            logger.info(f"  Output: {app_path}")
            logger.info(f"  Run:    open {app_path}")
            return
    else:
        exe_name = f"{name}.exe" if system == "Windows" else name
        exe_path = os.path.join(dist_root, name, exe_name)
        if os.path.isfile(exe_path):
            logger.info(f"  Output: {os.path.dirname(exe_path)}")
            logger.info(f"  Run:    {exe_path}")
            return

    logger.info(f"  Output: {dist_root}")
    logger.info("  Check the dist/ directory for built artifacts.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def log_build_header() -> None:
    """Log the platform, interpreter and project path."""
    logger.info("Labrynth Build Orchestrator")
    logger.info(f"  Platform: {platform.system()} {platform.machine()}")
    logger.info(f"  Python:   {sys.version.split()[0]}")
    logger.info(f"  Project:  {PROJECT_ROOT}")


def build_cli_only(avrdude: str) -> None:
    """Build only the CLI bundle; it ships no static/ and no LLM."""
    avrdude_path = validate_assets(avrdude, require_frontend=False)
    run_pyinstaller(avrdude_path, SPEC_FILE_CLI)
    report_output(CLI_BUNDLE_NAME)


def prepare_llm(skip: bool) -> tuple[str | None, str | None]:
    """Run Stage 2b and return the (llama-cli, GGUF) paths to bundle."""
    logger.info("\n=== Stage 2b: Local LLM (llama.cpp + GGUF) ===")
    llm_bin, llm_model = ensure_llm(skip=skip)
    if skip:
        logger.info("  [SKIP] llama.cpp / GGUF not bundled (--skip-llm)")
    elif llm_bin:
        logger.info(f"  [OK] llama-cli: {llm_bin}")
        logger.info(f"  [OK] GGUF:      {llm_model}")
    return llm_bin, llm_model


def build_gui(args: argparse.Namespace) -> None:
    """Build the GUI bundle, then the CLI bundle too when --cli is set."""
    if args.skip_frontend:
        logger.info("\n=== Stage 1: Build frontend [SKIPPED] ===")
    else:
        build_frontend()

    avrdude_path = validate_assets(args.avrdude)
    llm_bin, llm_model = prepare_llm(args.skip_llm)

    run_pyinstaller(avrdude_path, llm_bin=llm_bin, llm_model=llm_model)
    report_output()

    if args.cli:
        run_pyinstaller(avrdude_path, SPEC_FILE_CLI)
        report_output(CLI_BUNDLE_NAME)


def main() -> None:
    """Parse arguments and run the build stages in order."""
    args = parse_arguments()
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    log_build_header()

    validate_environment()
    if args.cli or args.cli_only:
        validate_cli_deps()

    if args.cli_only:
        build_cli_only(args.avrdude)
        return
    build_gui(args)


if __name__ == "__main__":
    main()
