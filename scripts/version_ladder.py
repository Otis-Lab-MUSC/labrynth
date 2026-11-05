"""Version-string forms and the alpha/beta/rc/stable ladder used by bump-version.py."""

from __future__ import annotations

import re
import sys

from version_output import write_err

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$")
LADDER_RE = re.compile(r"^(\d+\.\d+\.\d+)(?:-(alpha|beta|rc)\.(\d+))?$")
PEP440_RE = re.compile(r"^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$")

PEP440_TAGS = {"alpha": "a", "beta": "b", "rc": "rc"}
REVERSE_PEP440_TAGS = {"a": "alpha", "b": "beta", "rc": "rc"}
STAGE_ORDER = ["alpha", "beta", "rc"]

EXIT_FAILED = 1
EXIT_USAGE = 2


def identity(v: str) -> str:
    """Return the version unchanged."""
    return v


def pep440(v: str) -> str:
    """Convert ``3.0.0-alpha.1`` to its PEP 440 form ``3.0.0a1``."""
    m = LADDER_RE.match(v)
    if not m:
        return v
    base, kind, num = m.groups()
    if not kind:
        return base
    return f"{base}{PEP440_TAGS[kind]}{num}"


def pep440_to_semver(p440: str) -> str:
    """Reverse PEP 440 normalization: ``3.0.0a1`` -> ``3.0.0-alpha.1``."""
    m = PEP440_RE.match(p440)
    if m:
        base, tag, num = m.groups()
        return f"{base}-{REVERSE_PEP440_TAGS[tag]}.{num}"
    return p440


def shields(v: str) -> str:
    """Escape a version for shields.io badges: ``-`` becomes ``--``."""
    return v.replace("-", "--")


def fail(message: str, code: int = EXIT_FAILED) -> None:
    """Print an error to stderr and exit with the given code."""
    write_err(message)
    sys.exit(code)


def next_stage_version(current: str, stage: str) -> str:
    """Compute the next version by advancing through the alpha, beta, rc, stable ladder."""
    m = LADDER_RE.match(current)
    if not m:
        fail(f"Cannot advance stage: {current!r} is not valid semver")
        return current
    base, cur_stage, cur_num = m.groups()

    if stage == "stable":
        if cur_stage is None:
            fail(f"Already at stable: {current}")
        return base

    if stage not in STAGE_ORDER:
        fail(f"Unknown stage {stage!r}. Must be: alpha, beta, rc, stable", EXIT_USAGE)

    if cur_stage is None:
        fail(f"Stage regression: current version {current!r} is already stable; cannot advance to {stage}")

    cur_idx = STAGE_ORDER.index(cur_stage)
    new_idx = STAGE_ORDER.index(stage)
    if new_idx < cur_idx:
        fail(f"Stage regression: cannot go from {cur_stage} to {stage}")
    if new_idx == cur_idx:
        return f"{base}-{stage}.{int(cur_num) + 1}"
    return f"{base}-{stage}.1"
