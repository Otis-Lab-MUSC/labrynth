"""The app version the update check compares against comes from the bundle."""

from __future__ import annotations

from pathlib import Path

import pytest

from app_version import (
    APP_VERSION_ENV,
    VERSION_FILE_NAME,
    export_app_version,
    read_app_version,
)

PYPROJECT_TEXT = '[project]\nname = "labrynth"\nversion = "3.0.1-beta.16"\n'


def test_reads_the_version_file_in_a_bundle(tmp_path: Path) -> None:
    (tmp_path / VERSION_FILE_NAME).write_text("3.1.0-beta.17\n", encoding="utf-8")

    assert read_app_version(tmp_path) == "3.1.0-beta.17"


def test_version_file_wins_over_pyproject(tmp_path: Path) -> None:
    (tmp_path / VERSION_FILE_NAME).write_text("3.1.0", encoding="utf-8")
    (tmp_path / "pyproject.toml").write_text(PYPROJECT_TEXT, encoding="utf-8")

    assert read_app_version(tmp_path) == "3.1.0"


def test_falls_back_to_pyproject_in_a_checkout(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text(PYPROJECT_TEXT, encoding="utf-8")

    assert read_app_version(tmp_path) == "3.0.1-beta.16"


def test_returns_none_when_nothing_names_a_version(tmp_path: Path) -> None:
    assert read_app_version(tmp_path) is None


def test_blank_version_file_is_ignored(tmp_path: Path) -> None:
    (tmp_path / VERSION_FILE_NAME).write_text("  \n", encoding="utf-8")

    assert read_app_version(tmp_path) is None


def test_undecodable_version_file_is_ignored(tmp_path: Path) -> None:
    (tmp_path / VERSION_FILE_NAME).write_bytes(b"\xff\xfe\x00bad")

    assert read_app_version(tmp_path) is None


def test_pyproject_without_a_version_is_ignored(tmp_path: Path) -> None:
    (tmp_path / "pyproject.toml").write_text('[project]\nname = "labrynth"\n', encoding="utf-8")

    assert read_app_version(tmp_path) is None


def test_export_sets_the_environment_variable(tmp_path: Path) -> None:
    (tmp_path / VERSION_FILE_NAME).write_text("3.1.0", encoding="utf-8")
    environ: dict[str, str] = {}

    assert export_app_version(tmp_path, environ) == "3.1.0"
    assert environ[APP_VERSION_ENV] == "3.1.0"


def test_export_keeps_an_operator_override(tmp_path: Path) -> None:
    (tmp_path / VERSION_FILE_NAME).write_text("3.1.0", encoding="utf-8")
    environ = {APP_VERSION_ENV: "9.9.9"}

    assert export_app_version(tmp_path, environ) == "9.9.9"
    assert environ[APP_VERSION_ENV] == "9.9.9"


def test_export_leaves_the_environment_alone_without_a_version(tmp_path: Path) -> None:
    environ: dict[str, str] = {}

    assert export_app_version(tmp_path, environ) is None
    assert APP_VERSION_ENV not in environ


@pytest.mark.parametrize("text", ["", "   "])
def test_export_treats_a_blank_override_as_unset(tmp_path: Path, text: str) -> None:
    (tmp_path / VERSION_FILE_NAME).write_text("3.1.0", encoding="utf-8")
    environ = {APP_VERSION_ENV: text}

    assert export_app_version(tmp_path, environ) == "3.1.0"
