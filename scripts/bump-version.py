#!/usr/bin/env python3
"""Bump or verify the version string across all Labrynth source files.

Usage:
    python scripts/bump-version.py                       # print current version
    python scripts/bump-version.py 2.1.0                 # set version to 2.1.0
    python scripts/bump-version.py --check 2.1.0         # verify all files match 2.1.0 (exit 1 if not)
    python scripts/bump-version.py --reacher-pin 3.0.0   # set the reacher dependency pin
    python scripts/bump-version.py --stage alpha         # advance to next alpha/beta/rc/stable
    python scripts/bump-version.py --validate-stable     # exit 1 if current version has a prerelease suffix
    python scripts/bump-version.py --print-reacher-ref   # print the reacher git ref from the stored pin

Labrynth carries its own version (``pyproject.toml`` + ``web/package.json`` +
the root and ``web/`` README badges + the demo mock's reported backend version)
*and* a cross-repo pin on the ``reacher`` backend it ships. Those are
independent axes:

  - The plain ``<version>`` / ``--check`` forms manage Labrynth's own version.
    The README badges store it shields.io-escaped (``-`` -> ``--``); the demo
    mock (``web/src/api/{demoClient,mock}.ts``) stores it as a plain string so
    the hosted demo never reports a stale build.
  - ``--reacher-pin <semver>`` manages the ``reacher2p>=X.Y.Z`` dependency,
    normalizing the semver to its PEP 440 form (``3.0.0-alpha.1`` -> ``3.0.0a1``)
    so the pin pip actually resolves is never hand-derived. Bump this to ship a
    newer reacher backend + firmware.

Firmware versioning is not tracked here — firmware ships inside the ``reacher``
pip dependency and is pinned by the ``--reacher-pin`` value.
"""

from __future__ import annotations

import re
import sys

from version_files import NOT_FOUND, check_version, read_reacher_pin, read_versions, set_reacher_pin, set_version
from version_ladder import EXIT_FAILED, EXIT_USAGE, SEMVER_RE, fail, next_stage_version, pep440_to_semver
from version_output import write_out

STABLE_RE = re.compile(r"^\d+\.\d+\.\d+$")
BASE_RE = re.compile(r"^(\d+\.\d+\.\d+)")
PRIMARY_LABEL = "pyproject.toml"


def require_argument_count(args: list[str], usage: str) -> str:
    """Return the single value after a flag, or exit with the usage text."""
    if len(args) != 2:
        fail(f"Usage: bump-version.py {usage}", EXIT_USAGE)
    return args[1]


def read_current_version() -> str:
    """Return the version stored in pyproject.toml, exiting when it cannot be read."""
    current = read_versions().get(PRIMARY_LABEL, "")
    if not current or current == NOT_FOUND:
        fail("Could not read current version from pyproject.toml")
    return current


def require_semver(version: str) -> str:
    """Return the version if it is valid semver, else exit with a usage error."""
    if not SEMVER_RE.match(version):
        fail(f"Invalid semver: {version}", EXIT_USAGE)
    return version


def show_versions() -> None:
    """Print the current versions and the reacher pin."""
    write_out("Current versions:")
    for label, version in read_versions().items():
        write_out(f"  {label}: {version}")
    write_out(f"  reacher pin: >={read_reacher_pin()}")


def run_check(args: list[str]) -> None:
    """Handle ``--check``: exit 1 when any tracked file disagrees."""
    expected = require_argument_count(args, "--check <version>")
    write_out(f"Checking all files match version {expected}:")
    if not check_version(expected):
        sys.exit(EXIT_FAILED)
    write_out("All files consistent.")


def run_reacher_pin(args: list[str]) -> None:
    """Handle ``--reacher-pin``."""
    semver = require_argument_count(args, "--reacher-pin <semver>")
    set_reacher_pin(require_semver(semver))


def apply_version(new_version: str, heading: str) -> None:
    """Write a version everywhere and verify it."""
    write_out(heading)
    set_version(new_version)
    check_version(new_version)
    write_out("Done.")


def run_stage(args: list[str]) -> None:
    """Handle ``--stage``: advance the prerelease ladder."""
    stage = require_argument_count(args, "--stage alpha|beta|rc|stable")
    current = read_current_version()
    new_version = next_stage_version(current, stage)
    apply_version(new_version, f"Advancing {current} \u2192 {new_version}:")


def run_validate_stable() -> None:
    """Handle ``--validate-stable``: exit 1 when the version has a prerelease suffix."""
    current = read_current_version()
    if STABLE_RE.match(current):
        write_out(f"OK: {current} is a stable version")
        return
    base_match = BASE_RE.match(current)
    base = base_match.group(1) if base_match else current
    fail(f"Error: Stable release requires a stable version; current is {current}. Bump to {base} first.")


def run_print_reacher_ref() -> None:
    """Handle ``--print-reacher-ref``: print the git ref CI reads from stdout."""
    pin = read_reacher_pin()
    if pin == NOT_FOUND:
        fail("Could not read reacher pin from pyproject.toml")
    write_out(f"v{pep440_to_semver(pin)}")


def main() -> None:
    """Dispatch the command-line flags to the matching version operation."""
    args = sys.argv[1:]
    if not args:
        show_versions()
    elif args[0] == "--check":
        run_check(args)
    elif args[0] == "--reacher-pin":
        run_reacher_pin(args)
    elif args[0] == "--stage":
        run_stage(args)
    elif args[0] == "--validate-stable":
        run_validate_stable()
    elif args[0] == "--print-reacher-ref":
        run_print_reacher_ref()
    else:
        new_version = require_semver(args[0])
        apply_version(new_version, f"Bumping version to {new_version}:")


if __name__ == "__main__":
    main()
