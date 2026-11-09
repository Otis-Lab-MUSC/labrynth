"""The Windows installer must install per user, so the in-app updater can replace the folder."""

from __future__ import annotations

from pathlib import Path

ISS = Path(__file__).resolve().parents[1] / "installer" / "reacher.iss"


def setup_section() -> list[str]:
    lines = ISS.read_text(encoding="utf-8").splitlines()
    start = lines.index("[Setup]")
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("[")), len(lines))
    return lines[start + 1 : end]


def test_installs_without_administrator_rights() -> None:
    assert "PrivilegesRequired=lowest" in setup_section()


def test_install_folder_follows_the_privilege_level() -> None:
    assert "DefaultDirName={autopf}\\Labrynth" in setup_section()
