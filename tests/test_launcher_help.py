"""The GUI entry point must honor --help without starting the backend.

labrynth.spec packages launcher.py as the Labrynth binary. `--help` / `-h`
must print usage and exit 0 before reacher.api.app.main() binds
REACHER_PORT (default 6229).
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "launcher.py"
PORT = 6229


def _listening(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["REACHER_NO_BROWSER"] = "1"
    return subprocess.run(
        [sys.executable, str(LAUNCHER), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        env=env,
    )


class LauncherHelpTests(unittest.TestCase):
    def test_help_prints_usage_and_exits_without_binding(self):
        before = _listening(PORT)
        proc = _run(["--help"])
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Usage:", proc.stdout)
        self.assertIn("--help", proc.stdout)
        self.assertIn("--incognito", proc.stdout)
        self.assertNotIn("not installed", proc.stderr)
        self.assertNotIn("Uvicorn", proc.stderr)
        self.assertEqual(before, _listening(PORT))

    def test_short_help_flag(self):
        proc = _run(["-h"])
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Usage:", proc.stdout)

    def test_help_wins_when_combined_with_other_flags(self):
        proc = _run(["--incognito", "--help"])
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("Usage:", proc.stdout)
        self.assertNotIn("not installed", proc.stderr)


if __name__ == "__main__":
    unittest.main()
