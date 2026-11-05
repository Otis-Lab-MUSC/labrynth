"""prompt_toolkit style sheet for the REACHER CLI."""

from __future__ import annotations

from prompt_toolkit.styles import Style

CLI_STYLE = Style.from_dict(
    {
        "header": "bold fg:ansicyan",
        "header-status": "fg:ansigreen",
        "header-disconnected": "fg:ansired",
        "breadcrumb": "bold fg:ansiwhite",
        "separator": "fg:ansibrightblack",
        "item": "fg:ansiwhite",
        "item-selected": "bold fg:ansiblack bg:ansicyan",
        "item-suffix": "fg:ansibrightblack",
        "item-suffix-selected": "fg:ansiblack bg:ansicyan",
        "item-separator": "fg:ansiyellow",
        "help-bar": "fg:ansibrightblack",
        "status-bar": "fg:ansiyellow",
        "status-bar-error": "fg:ansired",
        "input-prompt": "bold fg:ansicyan",
        "input-text": "fg:ansiwhite",
        "monitor-header": "bold fg:ansicyan",
        "monitor-stats": "bold fg:ansiwhite",
        "monitor-event": "fg:ansiwhite",
        "monitor-time": "fg:ansibrightblack",
        "header-target": "bold fg:ansimagenta",
    }
)
