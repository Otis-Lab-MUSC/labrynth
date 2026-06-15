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
the README badge) *and* a cross-repo pin on the ``reacher`` backend it ships.
Those are independent axes:

  - The plain ``<version>`` / ``--check`` forms manage Labrynth's own version.
    The README badge stores it shields.io-escaped (``-`` -> ``--``).
  - ``--reacher-pin <semver>`` manages the ``reacher>=X.Y.Z`` dependency,
    normalizing the semver to its PEP 440 form (``3.0.0-alpha.1`` -> ``3.0.0a1``)
    so the pin pip actually resolves is never hand-derived. Bump this to ship a
    newer reacher backend + firmware.

Firmware versioning is not tracked here — firmware ships inside the ``reacher``
pip dependency and is pinned by the ``--reacher-pin`` value.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$")

_PEP440_TAGS = {"alpha": "a", "beta": "b", "rc": "rc"}
_REV_PEP440_TAGS = {"a": "alpha", "b": "beta", "rc": "rc"}
_STAGE_ORDER = ["alpha", "beta", "rc"]


# -- version-form transforms -------------------------------------------------


def identity(v: str) -> str:
    return v


def pep440(v: str) -> str:
    """``3.0.0-alpha.1`` -> ``3.0.0a1`` (PEP 440 prerelease normalization)."""
    m = re.match(r"^(\d+\.\d+\.\d+)(?:-(alpha|beta|rc)\.(\d+))?$", v)
    if not m:
        return v
    base, kind, num = m.groups()
    if not kind:
        return base
    return f"{base}{_PEP440_TAGS[kind]}{num}"


def pep440_to_semver(p440: str) -> str:
    """Reverse PEP 440 normalization: ``3.0.0a1`` -> ``3.0.0-alpha.1``."""
    m = re.match(r"^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$", p440)
    if m:
        base, tag, num = m.groups()
        return f"{base}-{_REV_PEP440_TAGS[tag]}.{num}"
    return p440


def shields(v: str) -> str:
    """shields.io badge escaping: ``-`` -> ``--`` (``3.0.0-alpha.1`` -> ``3.0.0--alpha.1``)."""
    return v.replace("-", "--")


def next_stage_version(current: str, stage: str) -> str:
    """Compute the next prerelease version by advancing through the alpha→beta→rc→stable ladder."""
    m = re.match(r"^(\d+\.\d+\.\d+)(?:-(alpha|beta|rc)\.(\d+))?$", current)
    if not m:
        print(f"Cannot advance stage: {current!r} is not valid semver", file=sys.stderr)
        sys.exit(1)
    base, cur_stage, cur_num = m.groups()

    if stage == "stable":
        if cur_stage is None:
            print(f"Already at stable: {current}", file=sys.stderr)
            sys.exit(1)
        return base

    if stage not in _STAGE_ORDER:
        print(f"Unknown stage {stage!r}. Must be: alpha, beta, rc, stable", file=sys.stderr)
        sys.exit(2)

    if cur_stage is None:
        print(
            f"Stage regression: current version {current!r} is already stable; cannot advance to {stage}",
            file=sys.stderr,
        )
        sys.exit(1)

    cur_idx = _STAGE_ORDER.index(cur_stage)
    new_idx = _STAGE_ORDER.index(stage)

    if new_idx < cur_idx:
        print(f"Stage regression: cannot go from {cur_stage} to {stage}", file=sys.stderr)
        sys.exit(1)

    if new_idx == cur_idx:
        return f"{base}-{stage}.{int(cur_num) + 1}"
    else:
        return f"{base}-{stage}.1"


# -- regex-based files (each declares the form it stores) --------------------
# (file, pattern with 3 capture groups, replacement template, transform, label)

REGEX_FILES: list[tuple[Path, str, str, "callable", str]] = [
    (
        ROOT / "pyproject.toml",
        r'^(version\s*=\s*")([^"]+)(")',
        r"\g<1>{version}\3",
        identity,
        "pyproject.toml",
    ),
    (
        ROOT / "README.md",
        r"(shields\.io/badge/version-)(.+?)(-blue)",
        r"\g<1>{version}\3",
        shields,
        "README.md (badge)",
    ),
]

# -- JSON-based files (parsed update) ----------------------------------------

JSON_FILES: list[Path] = [
    ROOT / "web" / "package.json",
]

# -- cross-repo reacher pin (managed via --reacher-pin) ----------------------

REACHER_PIN_FILE = ROOT / "pyproject.toml"
REACHER_PIN_RE = r'(reacher>=)([^"]+)(")'


def read_versions() -> dict[str, str]:
    """Return {label: version} for each tracked file (raw stored form)."""
    versions: dict[str, str] = {}

    for path, pattern, _, _transform, label in REGEX_FILES:
        text = path.read_text()
        match = re.search(pattern, text, re.MULTILINE)
        versions[label] = match.group(2) if match else "<not found>"

    for path in JSON_FILES:
        data = json.loads(path.read_text())
        versions[str(path.relative_to(ROOT))] = data.get("version", "<not found>")

    return versions


def set_version(new_version: str) -> None:
    """Write *new_version* (in each file's required form) into every tracked file."""
    for path, pattern, template, transform, label in REGEX_FILES:
        text = path.read_text()
        replacement = template.replace("{version}", transform(new_version))
        new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
        if count == 0:
            print(f"  WARNING: pattern not found in {label}")
        path.write_text(new_text)

    for path in JSON_FILES:
        data = json.loads(path.read_text())
        data["version"] = new_version
        path.write_text(json.dumps(data, indent=2) + "\n")


def check_version(expected: str) -> bool:
    """Return True if every tracked file contains *expected* (in its required form)."""
    ok = True

    for path, pattern, _, transform, label in REGEX_FILES:
        text = path.read_text()
        match = re.search(pattern, text, re.MULTILINE)
        found = match.group(2) if match else "<not found>"
        want = transform(expected)
        if found != want:
            print(f"  MISMATCH {label}: expected {want}, found {found}")
            ok = False
        else:
            print(f"  OK       {label}: {found}")

    for path in JSON_FILES:
        data = json.loads(path.read_text())
        found = data.get("version", "<not found>")
        label = str(path.relative_to(ROOT))
        if found != expected:
            print(f"  MISMATCH {label}: expected {expected}, found {found}")
            ok = False
        else:
            print(f"  OK       {label}: {found}")

    return ok


def read_reacher_pin() -> str:
    text = REACHER_PIN_FILE.read_text()
    match = re.search(REACHER_PIN_RE, text)
    return match.group(2) if match else "<not found>"


def set_reacher_pin(semver: str) -> None:
    """Write ``reacher>=<pep440(semver)>`` into pyproject.toml."""
    pinned = pep440(semver)
    text = REACHER_PIN_FILE.read_text()
    new_text, count = re.subn(REACHER_PIN_RE, rf"\g<1>{pinned}\3", text, count=1)
    if count == 0:
        print("  WARNING: reacher pin not found in pyproject.toml", file=sys.stderr)
        sys.exit(1)
    REACHER_PIN_FILE.write_text(new_text)
    print(f"reacher pin set to >={pinned}  (from {semver})")


def main() -> None:
    args = sys.argv[1:]

    if not args:
        print("Current versions:")
        for label, version in read_versions().items():
            print(f"  {label}: {version}")
        print(f"  reacher pin: >={read_reacher_pin()}")
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

    if args[0] == "--reacher-pin":
        if len(args) != 2:
            print("Usage: bump-version.py --reacher-pin <semver>", file=sys.stderr)
            sys.exit(2)
        semver = args[1]
        if not SEMVER_RE.match(semver):
            print(f"Invalid semver: {semver}", file=sys.stderr)
            sys.exit(2)
        set_reacher_pin(semver)
        return

    if args[0] == "--stage":
        if len(args) != 2:
            print("Usage: bump-version.py --stage alpha|beta|rc|stable", file=sys.stderr)
            sys.exit(2)
        stage = args[1]
        current_versions = read_versions()
        # Read from pyproject.toml (first REGEX_FILES entry)
        current = current_versions.get("pyproject.toml", "")
        if not current or current == "<not found>":
            print("Could not read current version from pyproject.toml", file=sys.stderr)
            sys.exit(1)
        new_version = next_stage_version(current, stage)
        print(f"Advancing {current} → {new_version}:")
        set_version(new_version)
        check_version(new_version)
        print("Done.")
        return

    if args[0] == "--validate-stable":
        current_versions = read_versions()
        current = current_versions.get("pyproject.toml", "")
        if not current or current == "<not found>":
            print("Could not read current version from pyproject.toml", file=sys.stderr)
            sys.exit(1)
        if re.match(r"^\d+\.\d+\.\d+$", current):
            print(f"OK: {current} is a stable version")
            return
        base = re.match(r"^(\d+\.\d+\.\d+)", current).group(1)
        print(
            f"Error: Stable release requires a stable version; current is {current}. "
            f"Bump to {base} first.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args[0] == "--print-reacher-ref":
        pin = read_reacher_pin()
        if pin == "<not found>":
            print("Could not read reacher pin from pyproject.toml", file=sys.stderr)
            sys.exit(1)
        semver = pep440_to_semver(pin)
        print(f"v{semver}")
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
