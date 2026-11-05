"""Line-oriented output helpers shared by the version scripts."""

from __future__ import annotations

import sys


def write_out(message: str) -> None:
    """Write one line of result output to stdout."""
    sys.stdout.write(message + "\n")


def write_err(message: str) -> None:
    """Write one line of diagnostics to stderr."""
    sys.stderr.write(message + "\n")
