"""Shared download, checksum and safe-extraction helpers for the build scripts."""

from __future__ import annotations

import hashlib
import http.client
import os
import shutil
import tarfile
import urllib.request
import zipfile

CHECKSUM_CHUNK_BYTES = 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 600
DOWNLOAD_USER_AGENT = "labrynth-build"

# A download failed: network/HTTP trouble (URLError is an OSError) or a truncated body.
DOWNLOAD_ERRORS: tuple[type[Exception], ...] = (OSError, http.client.HTTPException)


def hash_file(path: str) -> str:
    """Return the lowercase hex SHA-256 of a file, read in chunks."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(CHECKSUM_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_file(url: str, dest: str) -> None:
    """Download *url* to *dest* with a UA HuggingFace will accept."""
    request = urllib.request.Request(url, headers={"User-Agent": DOWNLOAD_USER_AGENT})
    with (
        urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_SECONDS) as source,
        open(dest, "wb") as out,
    ):
        shutil.copyfileobj(source, out)


def check_member_path(dest: str, member: str) -> None:
    """Raise RuntimeError when *member* would land outside *dest* (zip-slip)."""
    dest_abs = os.path.abspath(dest)
    target = os.path.abspath(os.path.join(dest_abs, member))
    if target != dest_abs and not target.startswith(dest_abs + os.sep):
        raise RuntimeError(f"unsafe path in archive: {member!r}")


def extract_zip_safely(archive: zipfile.ZipFile, dest: str) -> None:
    """Extract a ZipFile to dest, rejecting any member that escapes dest."""
    for member in archive.namelist():
        check_member_path(dest, member)
    archive.extractall(dest)


def extract_tar_safely(archive: tarfile.TarFile, dest: str) -> None:
    """Extract a TarFile to dest, rejecting any member that escapes dest."""
    for member in archive.getmembers():
        check_member_path(dest, member.name)
    archive.extractall(dest)
