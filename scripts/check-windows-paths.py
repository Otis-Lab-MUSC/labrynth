#!/usr/bin/env python3
"""Fail if any tracked path is unusable on Windows.

Windows refuses to create reserved device names (CON, AUX, NUL, COM1, ...)
regardless of extension, so a checkout containing `web/src/aux.ts` breaks
the Windows installer build. Also flags characters Windows forbids in file
names and names ending in a dot or space, which Windows silently strips.

Usage (from the repo root):
    python3 -I scripts/check-windows-paths.py
    python3 -I scripts/check-windows-paths.py --self-test

Exit 0 = clean, 1 = offending path(s) or self-test failure.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RESERVED = re.compile(r"^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$", re.IGNORECASE)
FORBIDDEN = set('<>:"|?*')


def path_reasons(path: str) -> list[str]:
    """Return why a path is unusable on Windows; empty if it is fine."""
    reasons = []
    for part in path.split("/"):
        stem = part.split(".", 1)[0]
        if RESERVED.match(stem):
            reasons.append(f"reserved Windows name in {part!r}")
        if any(c in FORBIDDEN or ord(c) < 32 or ord(c) == 127 for c in part):
            reasons.append(f"forbidden character in {part!r}")
        if part.endswith((".", " ")):
            reasons.append(f"ends in dot or space: {part!r}")
    return reasons


def tracked_paths() -> list[str]:
    """Return every path tracked by git."""
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    ).stdout
    return [p.decode("utf-8", "surrogateescape") for p in out.split(b"\0") if p]


BAD_PATHS = [
    "web/src/aux.ts",
    "docs/CON",
    "a/nul.txt.bak",
    "x/LPT1",
    "y/trailing. ",
    "z/what?.md",
]
GOOD_PATHS = [
    "web/src/auxOutput.ts",
    "auxiliary/x",
    "console.ts",
    "com10.txt",
]


def self_test() -> int:
    """Check the path rules against known-bad and known-good paths; return the exit code."""
    failures = []
    for path in BAD_PATHS:
        if not path_reasons(path):
            failures.append(f"expected flagged: {path!r}")
    for path in GOOD_PATHS:
        if path_reasons(path):
            failures.append(f"expected clean: {path!r}")
    for failure in failures:
        print(f"self-test FAIL: {failure}")
    if failures:
        return 1
    print(f"Windows path self-test OK: {len(BAD_PATHS)} bad, {len(GOOD_PATHS)} good")
    return 0


def main() -> int:
    """Scan tracked paths (or run the self-test) and return the exit code."""
    if "--self-test" in sys.argv[1:]:
        return self_test()

    paths = tracked_paths()
    offenders = 0
    for path in paths:
        for reason in path_reasons(path):
            print(f"{path}: {reason}")
            offenders += 1
            break
    if offenders:
        print(f"Windows path check FAILED: {offenders} offending path(s)")
        return 1
    print(f"Windows path check OK: {len(paths)} tracked paths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
