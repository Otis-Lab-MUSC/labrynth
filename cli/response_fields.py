"""Typed readers for the JSON bodies the backend returns."""

from __future__ import annotations


def read_str_list(value: object) -> list[str]:
    """Return the string items of a JSON array, or an empty list for any other value."""
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def read_record_list(value: object) -> list[dict[str, object]]:
    """Return the object items of a JSON array, or an empty list for any other value."""
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def read_str(value: object, default: str = "") -> str:
    """Return ``value`` when it is a string, otherwise ``default``."""
    return value if isinstance(value, str) else default


def read_optional_str(value: object) -> str | None:
    """Return ``value`` when it is a non-empty string, otherwise None."""
    return value if isinstance(value, str) and value else None
