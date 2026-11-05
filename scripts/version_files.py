"""The files that carry Labrynth's version and the reacher pin, with read, write and check."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from version_ladder import EXIT_FAILED, fail, identity, pep440, shields
from version_output import write_out

ROOT = Path(__file__).resolve().parent.parent
NOT_FOUND = "<not found>"
VERSION_TEMPLATE = r"\g<1>{version}\3"
BADGE_PATTERN = r"(shields\.io/badge/version-)(.+?)(-blue)"
DEMO_PATTERN = r'(version:\s*")([^"]+)(")'


@dataclass(frozen=True)
class RegexFile:
    """A text file whose version sits in one capture group of a pattern."""

    path: Path
    pattern: str
    template: str
    transform: Callable[[str], str]
    label: str


# Demo mode's mock health check reports a backend version string; each demo file
# has exactly one `version:` literal, stamped in lockstep with the app version.
REGEX_FILES: list[RegexFile] = [
    RegexFile(ROOT / "pyproject.toml", r'^(version\s*=\s*")([^"]+)(")', VERSION_TEMPLATE, identity, "pyproject.toml"),
    RegexFile(ROOT / "README.md", BADGE_PATTERN, VERSION_TEMPLATE, shields, "README.md (badge)"),
    RegexFile(ROOT / "web" / "README.md", BADGE_PATTERN, VERSION_TEMPLATE, shields, "web/README.md (badge)"),
    RegexFile(
        ROOT / "web" / "src" / "api" / "demoClient.ts",
        DEMO_PATTERN,
        VERSION_TEMPLATE,
        identity,
        "web/src/api/demoClient.ts (demo version)",
    ),
    RegexFile(
        ROOT / "web" / "src" / "api" / "mock.ts",
        DEMO_PATTERN,
        VERSION_TEMPLATE,
        identity,
        "web/src/api/mock.ts (demo version)",
    ),
]

JSON_FILES: list[Path] = [ROOT / "web" / "package.json"]

REACHER_PIN_FILE = ROOT / "pyproject.toml"
# PyPI distribution name is "reacher2p" (the "reacher" name was already taken);
# the import package the build resolves hex from is still "reacher".
REACHER_PIN_RE = r'(reacher2p>=)([^"]+)(")'


def find_stored_version(entry: RegexFile) -> str:
    """Return the version stored in a regex-managed file, or a placeholder."""
    match = re.search(entry.pattern, entry.path.read_text(), re.MULTILINE)
    return match.group(2) if match else NOT_FOUND


def read_json_version(path: Path) -> str:
    """Return the version field of a JSON file, or a placeholder."""
    return str(json.loads(path.read_text()).get("version", NOT_FOUND))


def read_versions() -> dict[str, str]:
    """Return {label: version} for each tracked file (raw stored form)."""
    versions = {entry.label: find_stored_version(entry) for entry in REGEX_FILES}
    for path in JSON_FILES:
        versions[str(path.relative_to(ROOT))] = read_json_version(path)
    return versions


def set_version(new_version: str) -> None:
    """Write *new_version* (in each file's required form) into every tracked file."""
    for entry in REGEX_FILES:
        text = entry.path.read_text()
        replacement = entry.template.replace("{version}", entry.transform(new_version))
        new_text, count = re.subn(entry.pattern, replacement, text, count=1, flags=re.MULTILINE)
        if count == 0:
            write_out(f"  WARNING: pattern not found in {entry.label}")
        entry.path.write_text(new_text)

    for path in JSON_FILES:
        data = json.loads(path.read_text())
        data["version"] = new_version
        path.write_text(json.dumps(data, indent=2) + "\n")


def report_comparison(label: str, want: str, found: str) -> bool:
    """Print OK or MISMATCH for one file and return whether it matched."""
    if found != want:
        write_out(f"  MISMATCH {label}: expected {want}, found {found}")
        return False
    write_out(f"  OK       {label}: {found}")
    return True


def check_version(expected: str) -> bool:
    """Return True if every tracked file contains *expected* (in its required form)."""
    ok = True
    for entry in REGEX_FILES:
        ok = report_comparison(entry.label, entry.transform(expected), find_stored_version(entry)) and ok
    for path in JSON_FILES:
        ok = report_comparison(str(path.relative_to(ROOT)), expected, read_json_version(path)) and ok
    return ok


def read_reacher_pin() -> str:
    """Return the semver-form reacher pin from pyproject.toml, or a placeholder if absent."""
    match = re.search(REACHER_PIN_RE, REACHER_PIN_FILE.read_text())
    return match.group(2) if match else NOT_FOUND


def set_reacher_pin(semver: str) -> None:
    """Write ``reacher2p>=<pep440(semver)>`` into pyproject.toml."""
    pinned = pep440(semver)
    text = REACHER_PIN_FILE.read_text()
    new_text, count = re.subn(REACHER_PIN_RE, rf"\g<1>{pinned}\3", text, count=1)
    if count == 0:
        fail("  WARNING: reacher pin not found in pyproject.toml", EXIT_FAILED)
    REACHER_PIN_FILE.write_text(new_text)
    write_out(f"reacher pin set to >={pinned}  (from {semver})")
