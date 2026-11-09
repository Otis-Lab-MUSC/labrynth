"""Find the Labrynth app version and hand it to the backend."""

from __future__ import annotations

import re
from collections.abc import MutableMapping
from pathlib import Path

APP_VERSION_ENV = "LABRYNTH_APP_VERSION"
VERSION_FILE_NAME = "VERSION"
PYPROJECT_FILE_NAME = "pyproject.toml"
PYPROJECT_VERSION_PATTERN = re.compile(r'^version\s*=\s*"([^"]+)"', re.MULTILINE)


def read_text_or_none(path: Path) -> str | None:
    """Return the stripped text of path, or None when it is missing, unreadable or blank."""
    try:
        text = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        return None
    return text or None


def read_pyproject_version(root: Path) -> str | None:
    """Return the project version from root/pyproject.toml, or None."""
    text = read_text_or_none(root / PYPROJECT_FILE_NAME)
    if text is None:
        return None
    match = PYPROJECT_VERSION_PATTERN.search(text)
    return match.group(1) if match else None


def read_app_version(root: Path) -> str | None:
    """Return the version named under root: the bundle's VERSION file, else pyproject.toml."""
    return read_text_or_none(root / VERSION_FILE_NAME) or read_pyproject_version(root)


def export_app_version(root: Path, environ: MutableMapping[str, str]) -> str | None:
    """Set the app version in environ unless the operator already did; return the value in effect."""
    override = environ.get(APP_VERSION_ENV, "").strip()
    if override:
        return override
    version = read_app_version(root)
    if version is not None:
        environ[APP_VERSION_ENV] = version
    return version


def write_version_file(root: Path, destination: Path) -> Path:
    """Write root's pyproject version to destination/VERSION for the bundle; raise ValueError if none."""
    version = read_pyproject_version(root)
    if version is None:
        raise ValueError(f"no version found in {root / PYPROJECT_FILE_NAME}")
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / VERSION_FILE_NAME
    target.write_text(version + "\n", encoding="utf-8")
    return target
