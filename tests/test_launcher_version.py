"""The launcher hands the bundle's version to the backend through the environment."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from app_version import APP_VERSION_ENV

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "launcher.py"
STUB_APP = 'import os\n\n\ndef main():\n    print("VERSION=" + os.environ.get("LABRYNTH_APP_VERSION", "<unset>"))\n'


def make_stub_reacher(parent: Path) -> Path:
    """Create a minimal reacher package whose main() prints the exported version."""
    package = parent / "reacher"
    (package / "api").mkdir(parents=True)
    (package / "__init__.py").write_text('__version__ = "99.0.0"\n', encoding="utf-8")
    (package / "api" / "__init__.py").write_text("", encoding="utf-8")
    (package / "api" / "app.py").write_text(STUB_APP, encoding="utf-8")
    return parent


def run_launcher(stub_parent: Path, override: str | None = None) -> str:
    env = {key: value for key, value in os.environ.items() if key not in {"PYTHONPATH", APP_VERSION_ENV}}
    env["PYTHONPATH"] = str(stub_parent)
    env["REACHER_NO_BROWSER"] = "1"
    if override is not None:
        env[APP_VERSION_ENV] = override
    result = subprocess.run(
        [sys.executable, str(LAUNCHER)],
        check=False,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=20,
        env=env,
    )
    return result.stdout.strip()


def test_launcher_exports_the_checkout_version(tmp_path: Path) -> None:
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    expected = next(line.split('"')[1] for line in pyproject.splitlines() if line.startswith("version"))

    assert run_launcher(make_stub_reacher(tmp_path)) == f"VERSION={expected}"


def test_launcher_keeps_an_operator_override(tmp_path: Path) -> None:
    assert run_launcher(make_stub_reacher(tmp_path), override="7.7.7") == "VERSION=7.7.7"
