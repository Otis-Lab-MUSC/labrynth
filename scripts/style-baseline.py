#!/usr/bin/env python3
"""Style ratchet: count style violations and fail if any count rises above style-baseline.json.

Usage:
    python scripts/style-baseline.py                 check against the baseline
    python scripts/style-baseline.py --update        lower the baseline to today's counts
    python scripts/style-baseline.py --update --allow-increase   also accept higher counts

Counts are repo-wide. Python: ruff rule families, mypy --strict, AST and comment scans over
cli/, build.py, launcher.py, scripts/. Web: line, comment and ESLint counts over web/src.
Needs ruff and mypy installed (pip install ".[dev]") and, for the web ESLint counts, web/node_modules.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from style_counts import (
    EXIT_FAILED,
    EXIT_OK,
    REPO_ROOT,
    WEB_DIR,
    measure_eslint,
    measure_mypy,
    measure_python_files,
    measure_ruff,
    measure_web_files,
    write_err,
)

DEFAULT_BASELINE = REPO_ROOT / "scripts" / "style-baseline.json"


def write_out(message: str) -> None:
    """Write one line of result output to stdout."""
    sys.stdout.write(message + "\n")


def measure_all(skip_mypy: bool, skip_eslint: bool) -> dict[str, int]:
    """Measure every metric, leaving out the ones the caller asked to skip."""
    counts: dict[str, int] = {}
    counts.update(measure_python_files())
    counts.update(measure_ruff())
    counts.update(measure_web_files())
    if not skip_mypy:
        counts.update(measure_mypy())
    if skip_eslint:
        write_err("note: eslint metrics skipped (--skip-eslint)")
    elif not (WEB_DIR / "node_modules").is_dir():
        write_err("note: eslint metrics skipped: web/node_modules is missing; run `npm ci` in web/")
    else:
        counts.update(measure_eslint())
    return dict(sorted(counts.items()))


def load_baseline(path: Path) -> dict[str, int]:
    """Read the baseline JSON, or return an empty baseline when the file is absent."""
    if not path.is_file():
        return {}
    return {str(name): int(value) for name, value in json.loads(path.read_text(encoding="utf-8")).items()}


def write_baseline(path: Path, values: dict[str, int]) -> None:
    """Write the baseline JSON with sorted keys, one metric per line."""
    path.write_text(json.dumps(values, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def check_against_baseline(current: dict[str, int], baseline: dict[str, int]) -> int:
    """Print every metric against its baseline and return the exit code."""
    status = EXIT_OK
    for name, value in current.items():
        if name not in baseline:
            write_out(f"{name}: {value} (no baseline; run with --update)")
            status = EXIT_FAILED
            continue
        write_out(f"{name}: {value} (baseline {baseline[name]})")
        if value > baseline[name]:
            write_err(f"FAIL {name}: {value} is above the baseline {baseline[name]}")
            status = EXIT_FAILED
        elif value < baseline[name]:
            write_out(f"  hint: {name} is below baseline; lower the baseline with --update")
    return status


def update_baseline(path: Path, current: dict[str, int], allow_increase: bool) -> int:
    """Rewrite the baseline with current counts; refuse to raise one without allow_increase."""
    baseline = load_baseline(path)
    raised = [name for name, value in current.items() if name in baseline and value > baseline[name]]
    if raised and not allow_increase:
        for name in raised:
            write_err(f"refusing to raise {name}: {baseline[name]} -> {current[name]} (use --allow-increase)")
        return EXIT_FAILED
    write_baseline(path, {**baseline, **current})
    write_out(f"updated {path}")
    return EXIT_OK


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    """Parse the command line."""
    parser = argparse.ArgumentParser(description="Style ratchet: fail if any style count rises.")
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE, help="baseline JSON to read or write")
    parser.add_argument("--update", action="store_true", help="rewrite the baseline with current counts")
    parser.add_argument("--allow-increase", action="store_true", help="with --update, accept higher counts")
    parser.add_argument("--skip-mypy", action="store_true", help="do not run mypy (fast tests only)")
    parser.add_argument("--skip-eslint", action="store_true", help="do not run ESLint (fast tests only)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run the ratchet and return the process exit code."""
    arguments = parse_arguments(argv)
    current = measure_all(arguments.skip_mypy, arguments.skip_eslint)
    if arguments.update:
        return update_baseline(arguments.baseline, current, arguments.allow_increase)
    return check_against_baseline(current, load_baseline(arguments.baseline))


if __name__ == "__main__":
    sys.exit(main())
