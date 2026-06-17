"""Entry point for the REACHER CLI.

Usage:
    python -m cli                  # auto-start backend + CLI
    python -m cli --no-server      # CLI only (backend must be running)
    python -m cli --port 6229      # custom backend port
"""

from __future__ import annotations

import argparse
import asyncio
import atexit
import os
import socket
import subprocess
import sys
import time


def _run_backend() -> None:
    """Run the reacher backend in-process.

    Used only by the frozen ``LabrynthCLI`` bundle, which re-launches itself
    with ``REACHER_RUN_BACKEND=1`` as the backend process (``sys.executable``
    is the frozen binary, so ``-m reacher`` is unavailable there).
    """
    from reacher.api.app import main as backend_main

    backend_main()


def _is_running(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_server(port: int, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _is_running(port):
            return True
        time.sleep(0.3)
    return False


def main() -> None:
    # Frozen-bundle backend trampoline: when the CLI re-spawns itself as the
    # server (see below), run the backend immediately and skip the TUI.
    if os.environ.get("REACHER_RUN_BACKEND") == "1":
        _run_backend()
        return

    parser = argparse.ArgumentParser(description="REACHER Terminal CLI")
    parser.add_argument(
        "--port",
        type=int,
        default=6229,
        help="Backend server port (default: 6229)",
    )
    parser.add_argument(
        "--no-server",
        action="store_true",
        help="Don't auto-start the backend server",
    )
    args = parser.parse_args()

    server_proc = None

    if not args.no_server and not _is_running(args.port):
        print(f"Starting REACHER backend on port {args.port}...")

        env = os.environ.copy()
        env["REACHER_PORT"] = str(args.port)
        if getattr(sys, "frozen", False):
            # Frozen bundle: sys.executable is the LabrynthCLI binary, which has
            # no `-m reacher` entry. Re-launch ourselves as the backend instead
            # (the REACHER_RUN_BACKEND trampoline at the top of main()).
            env["REACHER_RUN_BACKEND"] = "1"
            cmd = [sys.executable]
        else:
            cmd = [sys.executable, "-m", "reacher"]
        server_proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        def _cleanup():
            if server_proc and server_proc.poll() is None:
                server_proc.terminate()
                try:
                    server_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server_proc.kill()

        atexit.register(_cleanup)

        if not _wait_for_server(args.port):
            print("ERROR: Backend failed to start. Is `reacher` installed?", file=sys.stderr)
            sys.exit(1)
        print("Backend ready.")
    elif not args.no_server:
        print(f"Backend already running on port {args.port}.")

    from .app import ReacherCLI
    from .client import ReacherClient

    base = f"http://localhost:{args.port}"
    app = ReacherCLI(port=args.port)
    app.api = ReacherClient(base_url=base)
    asyncio.run(app.run_async())


if __name__ == "__main__":
    main()
