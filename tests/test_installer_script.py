"""The Windows installer must install per user, so the in-app updater can replace the folder."""

from __future__ import annotations

from pathlib import Path

ISS = Path(__file__).resolve().parents[1] / "installer" / "reacher.iss"


def section(name: str) -> list[str]:
    lines = ISS.read_text(encoding="utf-8").splitlines()
    start = lines.index(f"[{name}]")
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("[")), len(lines))
    return lines[start + 1 : end]


def setup_section() -> list[str]:
    return section("Setup")


def app_id() -> str:
    line = next(line for line in setup_section() if line.startswith("AppId="))
    return line.removeprefix("AppId=").replace("{{", "{")


def test_installs_without_administrator_rights() -> None:
    assert "PrivilegesRequired=lowest" in setup_section()


def test_install_folder_follows_the_privilege_level() -> None:
    assert "DefaultDirName={autopf}\\Labrynth" in setup_section()


def test_an_all_users_install_of_the_same_app_is_removed_before_installing() -> None:
    code = "\n".join(section("Code"))
    assert f"\\Uninstall\\{app_id()}_is1'" in code
    assert "function PrepareToInstall(" in code
    assert "HKLM32" in code and "HKLM64" in code
    assert "ShellExec('runas'" in code
