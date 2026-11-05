"""Type-only declaration of the screen and prompt state the UI mixins share."""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from .host import CliHost


class UiHost(CliHost):
    """Declares the input, selection and status attributes ``ReacherCLI`` owns."""

    if TYPE_CHECKING:
        status_message: str
        status_is_error: bool
        input_prompt: str
        input_value: str
        input_callback: Callable[..., object] | None
        input_mask: bool
        select_title: str
        select_options: list[tuple[str, str]]
        select_index: int
        select_callback: Callable[..., object] | None

        def _run_action(self, coro_fn: Callable[..., object]) -> None: ...
        def _submit_input(self) -> None: ...
        def _submit_select(self) -> None: ...
        def _cancel_input(self) -> None: ...
        async def _exit_monitor(self) -> None: ...
