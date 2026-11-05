"""Asset checks for the build: frontend dist, reacher firmware hex, and avrdude."""

from __future__ import annotations

import logging
import os
import shutil

from build_avrdude import ensure_real_avrdude, resolve_avrdude_conf

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(PROJECT_ROOT, "web", "dist")

PARADIGMS = ("fr", "pr", "vi", "omission", "pavlovian")
BOARDS = ("uno", "mega")


def resolve_reacher_hex_dir() -> str | None:
    """Return the firmware hex directory shipped inside the installed reacher package.

    Firmware hex is package data at ``reacher/hex/<board>/<paradigm>.hex``.
    Returns the absolute path to that ``hex`` directory, or None if reacher is
    not importable or ships no hex tree. Shared by build.py (asset validation)
    and labrynth.spec (bundling) so both agree on the source of truth.
    """
    try:
        from importlib import resources

        hex_dir = resources.files("reacher") / "hex"
        path = str(hex_dir)
    except (ImportError, ModuleNotFoundError, AttributeError):
        return None
    return path if os.path.isdir(path) else None


def check_frontend_dist() -> bool:
    """Log whether the built frontend exists and return True when it does."""
    index_html = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_html):
        logger.info(f"  [OK] Frontend dist: {FRONTEND_DIST}")
        return True
    logger.info(f"  [MISSING] Frontend dist: {index_html}")
    return False


def log_board_hex(hex_dir: str, board: str) -> None:
    """Log which paradigm hex files exist for one board."""
    board_dir = os.path.join(hex_dir, board)
    board_hex = [p for p in PARADIGMS if os.path.isfile(os.path.join(board_dir, f"{p}.hex"))]
    if board_hex:
        logger.info(f"  [OK] Hex files ({board}): {', '.join(board_hex)}")
    else:
        logger.info(f"  [WARN] No hex files found for {board} in {board_dir}")


def check_hex_files() -> bool:
    """Log the firmware hex shipped by reacher and return True when the tree exists."""
    hex_dir = resolve_reacher_hex_dir()
    if not hex_dir:
        logger.info("  [MISSING] reacher package firmware hex (reacher/hex/)")
        return False
    for board in BOARDS:
        log_board_hex(hex_dir, board)
    return True


def locate_avrdude(avrdude_path: str | None) -> tuple[str | None, bool]:
    """Return (real avrdude path, found), downloading on Windows when absent."""
    if avrdude_path and os.path.isfile(avrdude_path):
        real = ensure_real_avrdude(avrdude_path)
        logger.info(f"  [OK] avrdude: {real}")
        return real, True
    on_path = shutil.which("avrdude")
    if on_path:
        real = ensure_real_avrdude(on_path)
        logger.info(f"  [OK] avrdude: {real}")
        return real, True
    downloaded = ensure_real_avrdude(None)
    if downloaded and os.path.isfile(downloaded):
        logger.info(f"  [OK] avrdude (downloaded): {downloaded}")
        return downloaded, True
    logger.info("  [MISSING] avrdude — firmware upload won't work without it.")
    logger.info("            Install avrdude or run on Windows to auto-download.")
    return downloaded, False


def check_avrdude_conf(avrdude_path: str | None) -> bool:
    """Log whether the avrdude.conf matching the binary exists.

    A bundle with no conf would reach for the host's /etc/avrdude.conf and
    die on any version skew, and the spec's miss is silent. Fail the build
    here instead — loud in CI beats broken in a lab.
    """
    if not avrdude_path or not os.path.isfile(avrdude_path):
        return True
    avrdude_conf = resolve_avrdude_conf(avrdude_path)
    if avrdude_conf:
        logger.info(f"  [OK] avrdude.conf: {avrdude_conf}")
        return True
    logger.info(f"  [MISSING] avrdude.conf for {avrdude_path}")
    logger.info("            The conf must ship with the binary — avrdude rejects a conf")
    logger.info("            from a different release ('unable to process system wide")
    logger.info("            configuration file') and exits 1.")
    return False
