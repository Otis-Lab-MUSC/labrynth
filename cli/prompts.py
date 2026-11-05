"""Text-input and selection prompts for the REACHER CLI."""

from __future__ import annotations

from collections.abc import Callable

from .ui_host import UiHost


def _safe_int(val: str, label: str = "value") -> int | None:
    """Parse *val* as int, returning None on failure (for user-facing prompts)."""
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


class PromptMixin(UiHost):
    """Input and selection modes, mixed into ``ReacherCLI``."""

    def _prompt_input(self, prompt: str, callback: Callable[..., object], mask: bool = False) -> None:
        """Switch to text-input mode and call ``callback`` with the submitted value."""
        self.mode = "input"
        self.input_prompt = prompt
        self.input_value = ""
        self.input_callback = callback
        self.input_mask = mask
        self._invalidate()

    def _prompt_int_input(self, prompt: str, callback: Callable[..., object]) -> None:
        """Like _prompt_input, but validates that the value is an integer."""

        def _validate(val: str) -> object | None:
            """Pass the value to the callback as an int, or report an invalid number."""
            n = _safe_int(val, prompt)
            if n is None:
                self._set_status(f"Invalid number: {val!r}", error=True)
                return None
            return callback(n)

        self._prompt_input(prompt, _validate)

    def _prompt_select(self, title: str, options: list[tuple[str, str]], callback: Callable[..., object]) -> None:
        """Switch to selection mode and call ``callback`` with the chosen option's value."""
        self.mode = "select"
        self.select_title = title
        self.select_options = options
        self.select_index = 0
        self.select_callback = callback
        self._invalidate()

    def _submit_input(self) -> None:
        """Leave input mode and run the callback with the typed value."""
        value = self.input_value.strip()
        cb = self.input_callback
        self.mode = "menu"
        self.input_callback = None
        self._invalidate()
        if cb and value:
            self._run_action(lambda: cb(value))

    def _submit_select(self) -> None:
        """Leave selection mode and run the callback with the chosen value."""
        if not self.select_options:
            self.mode = "menu"
            return
        _label, value = self.select_options[self.select_index]
        cb = self.select_callback
        self.mode = "menu"
        self.select_callback = None
        self._invalidate()
        if cb:
            self._run_action(lambda: cb(value))

    def _cancel_input(self) -> None:
        """Leave input or selection mode without running the callback."""
        self.mode = "menu"
        self.input_callback = None
        self.select_callback = None
        self._invalidate()
