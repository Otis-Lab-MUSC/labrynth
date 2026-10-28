"""The style ratchet must pass on the committed baseline and fail when a count rises.

The tests pass --skip-mypy --skip-eslint so each run takes about a second; those two
metrics are absent from the run and therefore not compared.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "style-baseline.py"
COMMITTED_BASELINE = ROOT / "scripts" / "style-baseline.json"
FAST_FLAGS = ["--skip-mypy", "--skip-eslint"]
LOWERED_METRIC = "ruff_ANN"


def run_ratchet(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Run the ratchet script with the fast flags and capture its output."""
    command = [sys.executable, str(SCRIPT), *FAST_FLAGS, *arguments]
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)


def copy_baseline(tmp_path: Path, **overrides: int) -> Path:
    """Copy the committed baseline to a temp file with some metrics replaced."""
    values = json.loads(COMMITTED_BASELINE.read_text(encoding="utf-8"))
    values.update(overrides)
    copy = tmp_path / "baseline.json"
    copy.write_text(json.dumps(values, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return copy


def test_passes_on_committed_baseline() -> None:
    """The committed baseline matches the tree, so the check exits 0."""
    result = run_ratchet()
    assert result.returncode == 0, result.stderr


def test_fails_when_a_baseline_is_below_current(tmp_path: Path) -> None:
    """A count above its baseline fails the check and names the metric."""
    baseline = copy_baseline(tmp_path, **{LOWERED_METRIC: 0})
    result = run_ratchet("--baseline", str(baseline))
    assert result.returncode == 1
    assert LOWERED_METRIC in result.stderr


def test_update_refuses_to_raise_without_allow_increase(tmp_path: Path) -> None:
    """--update leaves the file alone when a count would rise."""
    baseline = copy_baseline(tmp_path, **{LOWERED_METRIC: 0})
    before = baseline.read_text(encoding="utf-8")
    result = run_ratchet("--baseline", str(baseline), "--update")
    assert result.returncode == 1
    assert baseline.read_text(encoding="utf-8") == before


def test_update_raises_with_allow_increase(tmp_path: Path) -> None:
    """--update --allow-increase rewrites the file with the higher count."""
    baseline = copy_baseline(tmp_path, **{LOWERED_METRIC: 0})
    result = run_ratchet("--baseline", str(baseline), "--update", "--allow-increase")
    assert result.returncode == 0, result.stderr
    assert json.loads(baseline.read_text(encoding="utf-8"))[LOWERED_METRIC] > 0
