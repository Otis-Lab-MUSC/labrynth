"""The --apply-update helper: wait for the old process, swap folders, relaunch, roll back."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app_version import APP_VERSION_ENV

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_ROLLED_BACK = 2
OLD_SUFFIX = ".old"
EXIT_WAIT_TIMEOUT_SECONDS = 60.0
POLL_INTERVAL_SECONDS = 0.25
START_WINDOW_SECONDS = 8.0
WINDOWS_QUERY_LIMITED = 0x1000
WINDOWS_STILL_ACTIVE = 259
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200


class SwapError(Exception):
    """The staged copy could not be moved into place."""


class Launched(Protocol):
    """A started app whose exit can be polled."""

    def poll(self) -> int | None: ...


@dataclass(frozen=True)
class ApplyArgs:
    """What the backend handed over."""

    staged: Path
    install: Path
    pid: int
    relaunch: bool


@dataclass(frozen=True)
class Dependencies:
    """The outside world, replaceable in tests."""

    is_alive: Callable[[int], bool]
    sleep: Callable[[float], None]
    clock: Callable[[], float]
    spawn: Callable[[Sequence[str]], Launched]


def parse_args(argv: Sequence[str]) -> ApplyArgs:
    """Parse the arguments after --apply-update."""
    parser = argparse.ArgumentParser(prog="Labrynth --apply-update")
    parser.add_argument("--staged", type=Path, required=True)
    parser.add_argument("--install", type=Path, required=True)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--relaunch", action="store_true")
    parsed = parser.parse_args(list(argv))
    return ApplyArgs(staged=parsed.staged, install=parsed.install, pid=parsed.pid, relaunch=parsed.relaunch)


def wait_for_exit(
    pid: int,
    is_alive: Callable[[int], bool],
    sleep: Callable[[float], None],
    clock: Callable[[], float],
    timeout: float,
    interval: float,
) -> bool:
    """Return True once pid is gone, False if it outlives timeout."""
    started = clock()
    while is_alive(pid):
        if clock() - started >= timeout:
            return False
        sleep(interval)
    return True


def aside_path(install: Path) -> Path:
    """Return where the running install is parked during the swap."""
    return install.parent / (install.name + OLD_SUFFIX)


def swap_folders(staged: Path, install: Path) -> Path:
    """Move install aside and staged into its place; return the aside folder.

    If the second move fails the install is put back, so the app is never left without a folder.
    """
    old = aside_path(install)
    try:
        if old.exists():
            shutil.rmtree(old)
        install.rename(old)
    except OSError as exc:
        raise SwapError(f"could not move {install} aside: {exc}") from exc
    try:
        staged.rename(install)
    except OSError as exc:
        old.rename(install)
        raise SwapError(f"could not move {staged} into place: {exc}") from exc
    return old


def restore_folders(install: Path, old: Path) -> None:
    """Replace install with the folder that was moved aside."""
    if install.exists():
        shutil.rmtree(install)
    old.rename(install)


def survives_start_window(process: Launched, deps: Dependencies) -> bool:
    """Return True if the launched app is still running when the start window closes."""
    started = deps.clock()
    while deps.clock() - started < START_WINDOW_SECONDS:
        deps.sleep(POLL_INTERVAL_SECONDS)
        if process.poll() is not None:
            return False
    return True


def run_apply_update(args: ApplyArgs, executable: Path, deps: Dependencies) -> int:
    """Run the whole update and return the process exit status."""
    relative = executable.relative_to(args.staged)
    launcher = args.install / relative
    if not wait_for_exit(
        args.pid, deps.is_alive, deps.sleep, deps.clock, EXIT_WAIT_TIMEOUT_SECONDS, POLL_INTERVAL_SECONDS
    ):
        return EXIT_FAILED
    try:
        old = swap_folders(args.staged, args.install)
    except SwapError:
        if args.relaunch:
            deps.spawn([str(launcher)])
        return EXIT_FAILED
    if not args.relaunch:
        shutil.rmtree(old, ignore_errors=True)
        return EXIT_OK
    if survives_start_window(deps.spawn([str(launcher)]), deps):
        shutil.rmtree(old, ignore_errors=True)
        return EXIT_OK
    restore_folders(args.install, old)
    deps.spawn([str(launcher)])
    return EXIT_ROLLED_BACK


def is_windows_process_alive(pid: int) -> bool:
    """Windows process check: open the process and read its exit code."""
    import ctypes

    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined,unused-ignore]
    handle = kernel32.OpenProcess(WINDOWS_QUERY_LIMITED, False, pid)
    if not handle:
        return False
    try:
        code = ctypes.c_ulong()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return False
        return code.value == WINDOWS_STILL_ACTIVE
    finally:
        kernel32.CloseHandle(handle)


def is_process_alive(pid: int) -> bool:
    """Return True while a process with this pid is running."""
    if sys.platform == "win32":
        return is_windows_process_alive(pid)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def relaunch_environment(environ: Mapping[str, str]) -> dict[str, str]:
    """Return environ without the old app's version, so the new app reads its own."""
    return {key: value for key, value in environ.items() if key != APP_VERSION_ENV}


def spawn_detached(command: Sequence[str]) -> Launched:
    """Start command so it outlives this helper."""
    options: dict[str, object] = {
        "env": relaunch_environment(os.environ),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        options["creationflags"] = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    return subprocess.Popen(list(command), **options)  # type: ignore[call-overload,no-any-return]


def main(argv: Sequence[str], executable: Path) -> int:
    """Entry point for `Labrynth --apply-update`; return the exit status."""
    args = parse_args(argv)
    try:
        executable.relative_to(args.staged)
    except ValueError:
        return EXIT_FAILED
    deps = Dependencies(is_alive=is_process_alive, sleep=time.sleep, clock=time.monotonic, spawn=spawn_detached)
    return run_apply_update(args, executable, deps)
