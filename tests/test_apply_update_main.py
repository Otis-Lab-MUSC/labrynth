"""The helper's real process check, its entry point, and the launcher routing."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from apply_update import EXIT_FAILED, EXIT_OK, is_process_alive, main

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "launcher.py"


def test_a_running_process_is_alive() -> None:
    assert is_process_alive(os.getpid()) is True


def test_a_finished_process_is_not_alive() -> None:
    child = subprocess.Popen([sys.executable, "-c", "pass"])
    child.wait()

    assert is_process_alive(child.pid) is False


def test_a_nonsense_pid_is_not_alive() -> None:
    assert is_process_alive(2**22 + 12345) is False


@pytest.mark.skipif(sys.platform == "win32", reason="runs a shell script as the launcher")
def test_main_swaps_a_real_folder_and_starts_the_new_launcher(tmp_path: Path) -> None:
    install = tmp_path / "Labrynth"
    staged = tmp_path / ".labrynth-update_x"
    for folder, marker in ((install, "old"), (staged, "new")):
        folder.mkdir()
        (folder / "marker").write_text(marker, encoding="utf-8")
    launcher = staged / "Labrynth-bin"
    launcher.write_text("#!/bin/sh\nsleep 30\n", encoding="utf-8")
    launcher.chmod(0o755)
    finished = subprocess.Popen([sys.executable, "-c", "pass"])
    finished.wait()

    status = main(
        ["--staged", str(staged), "--install", str(install), "--pid", str(finished.pid)],
        executable=launcher,
    )

    assert status == EXIT_OK
    assert (install / "marker").read_text(encoding="utf-8") == "new"
    assert not staged.exists()


def test_main_reports_a_staged_executable_outside_the_staged_folder(tmp_path: Path) -> None:
    staged = tmp_path / "staged"
    staged.mkdir()

    status = main(
        ["--staged", str(staged), "--install", str(tmp_path / "i"), "--pid", "1"],
        executable=tmp_path / "elsewhere" / "Labrynth",
    )

    assert status == EXIT_FAILED


def test_launcher_routes_apply_update_without_starting_the_backend(tmp_path: Path) -> None:
    env = os.environ.copy()
    env["REACHER_NO_BROWSER"] = "1"

    result = subprocess.run(
        [sys.executable, str(LAUNCHER), "--apply-update", "--staged", str(tmp_path)],
        check=False,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        env=env,
    )

    assert result.returncode != 0
    assert "--pid" in result.stderr
