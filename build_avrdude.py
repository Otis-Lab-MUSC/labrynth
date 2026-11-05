"""Locate, download and verify the avrdude binary and its config for bundling."""

from __future__ import annotations

import logging
import os
import platform
import urllib.request
import zipfile

from build_archive import DOWNLOAD_ERRORS, extract_zip_safely, hash_file

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

AVRDUDE_VERSION = "8.1"
AVRDUDE_MIN_SIZE = 100_000  # bytes — Chocolatey shims are ~24 KB, real binary is ~7 MB
AVRDUDE_DIST_DIRNAME = ".avrdude-dist"
AVRDUDE_EXE_NAME = "avrdude.exe"
AVRDUDE_RELEASE_URL = "https://github.com/avrdudes/avrdude/releases/download"

# SHA-256 of avrdude-v<ver>-windows-x64.zip from the official GitHub release.
# Pinned in-repo because upstream publishes no per-asset checksum for this zip.
# Update together with AVRDUDE_VERSION (and the matching CI pins in
# .github/workflows/build-installers.yml + build-prerelease.yml).
# Compute: sha256sum avrdude-v<ver>-windows-x64.zip
AVRDUDE_SHA256 = {
    "8.1": "e4d571d81fee3387d51bfdedd0b6565e4c201e974101cac2caec7adfd6201da3",
}

# SHA-256 of the avrdude.exe extracted from that zip. Verified before the binary
# is returned — covers both a fresh download and reuse of the cache dir.
# Update alongside AVRDUDE_SHA256.
# Compute: unzip -p avrdude-v<ver>-windows-x64.zip avrdude.exe | sha256sum
AVRDUDE_EXE_SHA256 = {
    "8.1": "b08186071b0877ceed6ec3e86dd42ee6d2b7556859659b34d4e326069cafbf45",
}


def resolve_avrdude_conf(avrdude_path: str | None) -> str | None:
    """Return the avrdude.conf belonging to *avrdude_path*, or None.

    The conf and the binary MUST come from the same avrdude install. ``-C``
    replaces the system-wide config outright rather than adding to it, and
    avrdude rejects a conf written for a different release outright:
    avrdude 7.1 handed Arch's 8.2 conf prints "unable to process system wide
    configuration file <path>" and exits 1 — a hard failure, not a warning.
    This helper exists so a bundle never ships a mismatched conf.

    Candidates, first hit wins:
      1. ``<dir>/avrdude.conf``                  — Windows release zip
      2. ``<dir>/../etc/avrdude.conf``           — Homebrew, ``--prefix`` builds
      3. ``<dir>/../share/avrdude/avrdude.conf``
      4. ``/etc/avrdude.conf``                   — distro packages, POSIX only

    The three binary-relative candidates are tried first so Windows and macOS
    resolve exactly the file they always have. Candidate 4 exists because the
    Debian/Ubuntu package splits the conf to ``/etc`` while the binary lands in
    ``/usr/bin`` — neither relative candidate can reach it — and it is safe
    there precisely because the binary being bundled is that same package's.
    """
    if not avrdude_path:
        return None
    avrdude_dir = os.path.dirname(os.path.abspath(avrdude_path))
    candidates = [
        os.path.join(avrdude_dir, "avrdude.conf"),
        os.path.join(avrdude_dir, "..", "etc", "avrdude.conf"),
        os.path.join(avrdude_dir, "..", "share", "avrdude", "avrdude.conf"),
    ]
    if os.name == "posix":
        candidates.append(os.path.join(os.sep, "etc", "avrdude.conf"))
    for conf in candidates:
        if os.path.isfile(conf):
            return os.path.abspath(conf)
    return None


def verify_avrdude_exe(path: str) -> bool:
    """Return True if path is a real avrdude.exe matching the pinned SHA-256.

    Used for both a freshly extracted binary and a cached one from a prior
    run, so nothing is bundled without an integrity check.
    """
    if os.path.getsize(path) < AVRDUDE_MIN_SIZE:
        return False
    expected = AVRDUDE_EXE_SHA256.get(AVRDUDE_VERSION)
    return bool(expected) and hash_file(path) == expected


def find_verified_avrdude(search_dir: str) -> str | None:
    """Return the first avrdude.exe under *search_dir* that passes verification."""
    for root, _dirs, files in os.walk(search_dir):
        for name in files:
            if name.lower() != AVRDUDE_EXE_NAME:
                continue
            candidate = os.path.join(root, name)
            if verify_avrdude_exe(candidate):
                return candidate
    return None


def check_provided_avrdude(avrdude_path: str | None) -> str | None:
    """Return *avrdude_path* when it is a real binary, warning when it looks like a shim."""
    if not avrdude_path or not os.path.isfile(avrdude_path):
        return None
    size = os.path.getsize(avrdude_path)
    if size >= AVRDUDE_MIN_SIZE:
        return avrdude_path
    logger.info(f"  [WARN] avrdude at {avrdude_path} is only {size:,} bytes (likely a shim)")
    return None


def download_avrdude_zip(zip_path: str, asset: str) -> bool:
    """Download the avrdude release archive, returning False on failure."""
    url = f"{AVRDUDE_RELEASE_URL}/v{AVRDUDE_VERSION}/{asset}"
    logger.info(f"  [INFO] Downloading avrdude v{AVRDUDE_VERSION} from {url}")
    try:
        urllib.request.urlretrieve(url, zip_path)
    except DOWNLOAD_ERRORS as exc:
        logger.error(f"  [ERROR] Failed to download avrdude: {exc}")
        return False
    return True


def verify_avrdude_zip(zip_path: str) -> bool:
    """Check the archive against its pinned SHA-256, deleting it on failure."""
    expected = AVRDUDE_SHA256.get(AVRDUDE_VERSION)
    if not expected:
        logger.error(
            f"  [ERROR] No pinned SHA-256 for avrdude v{AVRDUDE_VERSION} — "
            f"add it to AVRDUDE_SHA256. Refusing to bundle."
        )
        os.remove(zip_path)
        return False
    actual = hash_file(zip_path)
    if actual != expected:
        logger.error(f"  [ERROR] avrdude checksum mismatch — refusing to bundle. expected={expected} actual={actual}")
        os.remove(zip_path)
        return False
    logger.info(f"  [OK] Verified avrdude SHA-256: {actual}")
    return True


def extract_avrdude_zip(zip_path: str, dist_dir: str) -> None:
    """Extract the archive into *dist_dir*, always removing the archive afterwards."""
    os.makedirs(dist_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as archive:
            extract_zip_safely(archive, dist_dir)
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)


def download_real_avrdude(dist_dir: str) -> str | None:
    """Download, verify and extract avrdude, returning the verified exe or None."""
    asset = f"avrdude-v{AVRDUDE_VERSION}-windows-x64.zip"
    zip_path = os.path.join(PROJECT_ROOT, asset)
    if not download_avrdude_zip(zip_path, asset):
        return None
    if not verify_avrdude_zip(zip_path):
        return None
    extract_avrdude_zip(zip_path, dist_dir)
    real = find_verified_avrdude(dist_dir)
    if real:
        logger.info(f"  [OK] Downloaded avrdude: {real} ({os.path.getsize(real):,} bytes)")
        return real
    logger.error("  [ERROR] verified avrdude.exe not found in downloaded archive")
    return None


def ensure_real_avrdude(avrdude_path: str | None) -> str | None:
    """Return a path to a real avrdude binary, downloading one if necessary.

    On Windows, Chocolatey installs a small shim (~24 KB) instead of the
    real binary.  The shim breaks when relocated into a PyInstaller bundle.
    This function detects shims by file size and downloads the real avrdude
    from GitHub releases automatically.
    """
    provided = check_provided_avrdude(avrdude_path)
    if provided:
        return provided
    # Linux/macOS package managers install real binaries; only Windows needs a download.
    if platform.system() != "Windows":
        return avrdude_path

    dist_dir = os.path.join(PROJECT_ROOT, AVRDUDE_DIST_DIRNAME)
    # Re-verify the cache so a stale or tampered dir is never trusted on size alone.
    cached = find_verified_avrdude(dist_dir) if os.path.isdir(dist_dir) else None
    if cached:
        logger.info(f"  [OK] Using cached avrdude: {cached}")
        return cached
    return download_real_avrdude(dist_dir) or avrdude_path
