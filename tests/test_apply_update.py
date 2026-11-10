"""The --apply-update helper: wait for the old process, swap folders, relaunch, roll back."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from apply_update import (
    EXIT_FAILED,
    EXIT_OK,
    EXIT_ROLLED_BACK,
    OLD_SUFFIX,
    ApplyArgs,
    Dependencies,
    SwapError,
    parse_args,
    relaunch_environment,
    restore_folders,
    run_apply_update,
    spawn_detached,
    swap_folders,
    wait_for_exit,
)

LAUNCHER_NAME = "Labrynth"


def make_folder(root: Path, name: str, marker: str) -> Path:
    """Create root/name holding a launcher file whose text is marker."""
    folder = root / name
    folder.mkdir()
    (folder / LAUNCHER_NAME).write_text(marker, encoding="utf-8")
    return folder


def marker_of(folder: Path) -> str:
    return (folder / LAUNCHER_NAME).read_text(encoding="utf-8")


@dataclass
class FakeProcess:
    """A launched app that reports exit_code from poll() after survived_polls polls."""

    exit_code: int | None = None
    survived_polls: int = 0
    polls: int = 0

    def poll(self) -> int | None:
        self.polls += 1
        return None if self.polls <= self.survived_polls else self.exit_code


@dataclass
class Harness:
    """Records what the helper did, in order, against real folders."""

    install: Path
    staged: Path
    processes: list[FakeProcess] = field(default_factory=list)
    launched: list[Sequence[str]] = field(default_factory=list)
    slept: list[float] = field(default_factory=list)
    clock_value: float = 0.0
    alive_checks: list[int] = field(default_factory=list)
    alive_for: int = 0

    def is_alive(self, pid: int) -> bool:
        self.alive_checks.append(pid)
        return len(self.alive_checks) <= self.alive_for

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.clock_value += seconds

    def clock(self) -> float:
        return self.clock_value

    def spawn(self, command: Sequence[str]) -> FakeProcess:
        self.launched.append(command)
        index = len(self.launched) - 1
        return self.processes[index] if index < len(self.processes) else FakeProcess(survived_polls=10**6)

    def dependencies(self) -> Dependencies:
        return Dependencies(is_alive=self.is_alive, sleep=self.sleep, clock=self.clock, spawn=self.spawn)

    def args(self, relaunch: bool = True) -> ApplyArgs:
        return ApplyArgs(staged=self.staged, install=self.install, pid=4242, relaunch=relaunch)


@pytest.fixture
def harness(tmp_path: Path) -> Harness:
    return Harness(
        install=make_folder(tmp_path, "Labrynth-dir", "old"),
        staged=make_folder(tmp_path, ".labrynth-update_x", "new"),
    )


def run(harness: Harness, relaunch: bool = True) -> int:
    executable = harness.staged / LAUNCHER_NAME
    return run_apply_update(harness.args(relaunch), executable, harness.dependencies())


def test_parse_args_reads_the_agreed_shape(tmp_path: Path) -> None:
    parsed = parse_args(
        ["--staged", str(tmp_path / "s"), "--install", str(tmp_path / "i"), "--pid", "77", "--relaunch"]
    )

    assert parsed == ApplyArgs(staged=tmp_path / "s", install=tmp_path / "i", pid=77, relaunch=True)


def test_parse_args_relaunch_is_optional(tmp_path: Path) -> None:
    parsed = parse_args(["--staged", str(tmp_path), "--install", str(tmp_path), "--pid", "1"])

    assert parsed.relaunch is False


def test_parse_args_rejects_a_missing_pid(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        parse_args(["--staged", str(tmp_path), "--install", str(tmp_path)])


def test_wait_for_exit_returns_once_the_process_is_gone() -> None:
    state = Harness(install=Path("."), staged=Path("."), alive_for=3)

    assert wait_for_exit(1, state.is_alive, state.sleep, state.clock, timeout=30.0, interval=0.5) is True
    assert state.slept == [0.5, 0.5, 0.5]


def test_wait_for_exit_gives_up_at_the_timeout() -> None:
    state = Harness(install=Path("."), staged=Path("."), alive_for=10**6)

    assert wait_for_exit(1, state.is_alive, state.sleep, state.clock, timeout=2.0, interval=0.5) is False
    assert sum(state.slept) == 2.0


def test_swap_moves_the_install_aside_and_the_staged_copy_in(harness: Harness) -> None:
    old = swap_folders(harness.staged, harness.install)

    assert marker_of(harness.install) == "new"
    assert marker_of(old) == "old"
    assert old.name == harness.install.name + OLD_SUFFIX
    assert not harness.staged.exists()


def test_swap_clears_a_leftover_old_folder(harness: Harness) -> None:
    stale = harness.install.parent / (harness.install.name + OLD_SUFFIX)
    stale.mkdir()
    (stale / "leftover").write_text("x", encoding="utf-8")

    old = swap_folders(harness.staged, harness.install)

    assert not (old / "leftover").exists()
    assert marker_of(old) == "old"


def test_swap_puts_the_install_back_when_the_second_move_fails(harness: Harness) -> None:
    harness.staged.rename(harness.staged.parent / "elsewhere")

    with pytest.raises(SwapError):
        swap_folders(harness.staged, harness.install)

    assert marker_of(harness.install) == "old"
    assert not (harness.install.parent / (harness.install.name + OLD_SUFFIX)).exists()


def test_restore_puts_the_old_folder_back(harness: Harness) -> None:
    old = swap_folders(harness.staged, harness.install)

    restore_folders(harness.install, old)

    assert marker_of(harness.install) == "old"
    assert not old.exists()


def test_success_swaps_relaunches_and_deletes_the_old_copy(harness: Harness) -> None:
    status = run(harness)

    assert status == EXIT_OK
    assert marker_of(harness.install) == "new"
    assert not (harness.install.parent / (harness.install.name + OLD_SUFFIX)).exists()
    assert harness.launched == [[str(harness.install / LAUNCHER_NAME)]]


def test_waits_for_the_old_process_before_touching_folders(harness: Harness) -> None:
    harness.alive_for = 2
    seen: list[str] = []
    original_spawn = harness.spawn

    def spawn_and_record(command: Sequence[str]) -> FakeProcess:
        seen.append(marker_of(harness.install))
        return original_spawn(command)

    deps = Dependencies(is_alive=harness.is_alive, sleep=harness.sleep, clock=harness.clock, spawn=spawn_and_record)

    run_apply_update(harness.args(), harness.staged / LAUNCHER_NAME, deps)

    assert harness.alive_checks[:3] == [4242, 4242, 4242]
    assert seen == ["new"]


def test_does_not_swap_when_the_old_process_never_exits(harness: Harness) -> None:
    harness.alive_for = 10**6

    status = run(harness)

    assert status == EXIT_FAILED
    assert marker_of(harness.install) == "old"
    assert marker_of(harness.staged) == "new"
    assert harness.launched == []


def test_without_relaunch_it_swaps_and_starts_nothing(harness: Harness) -> None:
    status = run(harness, relaunch=False)

    assert status == EXIT_OK
    assert marker_of(harness.install) == "new"
    assert harness.launched == []


def test_rolls_back_when_the_new_app_dies_in_its_start_window(harness: Harness) -> None:
    harness.processes = [FakeProcess(exit_code=1, survived_polls=1)]

    status = run(harness)

    assert status == EXIT_ROLLED_BACK
    assert marker_of(harness.install) == "old"
    assert len(harness.launched) == 2
    assert harness.launched[1] == [str(harness.install / LAUNCHER_NAME)]


def test_rollback_keeps_the_failed_update_out_of_the_install(harness: Harness) -> None:
    harness.processes = [FakeProcess(exit_code=3, survived_polls=0)]

    run(harness)

    leftovers = sorted(p.name for p in harness.install.parent.iterdir())
    assert leftovers == [harness.install.name]


def test_a_failed_swap_relaunches_the_old_app(harness: Harness) -> None:
    harness.staged.rename(harness.staged.parent / "elsewhere")

    status = run(harness)

    assert status == EXIT_FAILED
    assert marker_of(harness.install) == "old"
    assert harness.launched == [[str(harness.install / LAUNCHER_NAME)]]


def test_a_failed_swap_without_relaunch_starts_nothing(harness: Harness) -> None:
    harness.staged.rename(harness.staged.parent / "elsewhere")

    status = run(harness, relaunch=False)

    assert status == EXIT_FAILED
    assert harness.launched == []


def test_relaunch_environment_drops_only_the_old_app_version() -> None:
    environ = {"LABRYNTH_APP_VERSION": "3.0.1-beta.17", "PATH": "/bin", "HOME": "/h"}
    assert relaunch_environment(environ) == {"PATH": "/bin", "HOME": "/h"}


def test_spawn_detached_starts_the_app_without_the_old_version(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def fake_popen(command: list[str], **options: object) -> object:
        seen.update(options)
        return object()

    monkeypatch.setenv("LABRYNTH_APP_VERSION", "3.0.1-beta.17")
    monkeypatch.setattr("apply_update.subprocess.Popen", fake_popen)
    spawn_detached(["/x/Labrynth"])
    env = seen["env"]
    assert isinstance(env, dict)
    assert "LABRYNTH_APP_VERSION" not in env
    assert "PATH" in env
