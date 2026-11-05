"""Command-line flags for build.py."""

from __future__ import annotations

import argparse


def parse_arguments() -> argparse.Namespace:
    """Parse the command-line flags."""
    parser = argparse.ArgumentParser(
        description="Build Labrynth standalone executable",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Example: python build.py --skip-frontend --avrdude /usr/bin/avrdude",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip npm build (use existing web/dist/)",
    )
    parser.add_argument(
        "--avrdude",
        metavar="PATH",
        default="",
        help="Explicit path to avrdude binary to bundle",
    )
    parser.add_argument(
        "--cli",
        action="store_true",
        help="Also build the standalone LabrynthCLI console app",
    )
    parser.add_argument(
        "--cli-only",
        action="store_true",
        help="Build only LabrynthCLI (no frontend, no GUI bundle)",
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Skip downloading/bundling llama.cpp + GGUF (GUI builds only; issue reporting will be unavailable)",
    )
    return parser.parse_args()
