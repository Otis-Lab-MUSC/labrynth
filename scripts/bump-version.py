#!/usr/bin/env python3
"""Bump or verify the version string across all Labrynth source files.

Usage:
    python scripts/bump-version.py                       # print current version + firmware SHA
    python scripts/bump-version.py 2.1.0                 # set version to 2.1.0
    python scripts/bump-version.py --check 2.1.0         # verify all files match 2.1.0 (exit 1 if not)
    python scripts/bump-version.py --check-firmware      # verify firmware submodule matches develop HEAD
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$")

FIRMWARE_REMOTE = "https://github.com/otis-lab-musc/reacher-firmware.git"
FIRMWARE_REF = "refs/heads/develop"

# -- TOML-based files (regex replacement) ------------------------------------

TOML_FILES: list[tuple[Path, str, str]] = [
    (
        ROOT / "pyproject.toml",
        r'^(version\s*=\s*")([^"]+)(")',
        r'\g<1>{version}\3',
    ),
]


# -- JSON-based files (parsed update) ----------------------------------------

JSON_FILES: list[Path] = [
    ROOT / "web" / "package.json",
]


def read_firmware_sha() -> tuple[str, str]:
    """Return (local_sha, remote_sha). remote_sha is '<fetch-failed>' on error."""
    local = subprocess.check_output(
        ["git", "-C", str(ROOT / "firmware"), "rev-parse", "HEAD"],
        text=True,
    ).strip()
    try:
        raw = subprocess.check_output(
            ["git", "ls-remote", FIRMWARE_REMOTE, FIRMWARE_REF],
            text=True,
            timeout=10,
        ).strip()
        remote = raw.split()[0] if raw else "<not found>"
    except Exception:
        remote = "<fetch-failed>"
    return local, remote


def check_firmware_sha() -> bool:
    """Return True if local submodule matches remote develop HEAD."""
    local, remote = read_firmware_sha()
    print(f"  firmware local  : {local}")
    print(f"  firmware remote : {remote}")
    if remote.startswith("<"):
        print("  WARNING: could not reach remote — skipping comparison.")
        return True  # non-fatal locally; CI is the authoritative gate
    ok = local == remote
    if not ok:
        print("  MISMATCH: run `git submodule update --remote --merge firmware`")
    return ok


def read_versions() -> dict[str, str]:
    """Return {filepath: version} for each tracked file."""
    versions: dict[str, str] = {}

    for path, pattern, _ in TOML_FILES:
        text = path.read_text()
        match = re.search(pattern, text, re.MULTILINE)
        versions[str(path.relative_to(ROOT))] = match.group(2) if match else "<not found>"

    for path in JSON_FILES:
        data = json.loads(path.read_text())
        versions[str(path.relative_to(ROOT))] = data.get("version", "<not found>")

    return versions


def set_version(new_version: str) -> None:
    """Write *new_version* into every tracked file."""
    for path, pattern, template in TOML_FILES:
        text = path.read_text()
        replacement = template.replace("{version}", new_version)
        new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
        if count == 0:
            print(f"  WARNING: pattern not found in {path.relative_to(ROOT)}")
        path.write_text(new_text)

    for path in JSON_FILES:
        data = json.loads(path.read_text())
        data["version"] = new_version
        path.write_text(json.dumps(data, indent=2) + "\n")


def check_version(expected: str) -> bool:
    """Return True if every tracked file contains *expected*."""
    ok = True
    for file, version in read_versions().items():
        if version != expected:
            print(f"  MISMATCH {file}: expected {expected}, found {version}")
            ok = False
        else:
            print(f"  OK       {file}: {version}")
    return ok


def main() -> None:
    args = sys.argv[1:]

    if not args:
        print("Current versions:")
        for file, version in read_versions().items():
            print(f"  {file}: {version}")
        local, _ = read_firmware_sha()
        print(f"  firmware/  (submodule): {local[:12]}")
        return

    if args[0] == "--check-firmware":
        print("Checking firmware submodule against develop HEAD:")
        if not check_firmware_sha():
            sys.exit(1)
        print("Firmware submodule is current.")
        return

    if args[0] == "--check":
        if len(args) != 2:
            print("Usage: bump-version.py --check <version>", file=sys.stderr)
            sys.exit(2)
        expected = args[1]
        print(f"Checking all files match version {expected}:")
        if not check_version(expected):
            sys.exit(1)
        print("All files consistent.")
        return

    new_version = args[0]
    if not SEMVER_RE.match(new_version):
        print(f"Invalid semver: {new_version}", file=sys.stderr)
        sys.exit(2)

    print(f"Bumping version to {new_version}:")
    set_version(new_version)
    check_version(new_version)
    print("Done.")


if __name__ == "__main__":
    main()
