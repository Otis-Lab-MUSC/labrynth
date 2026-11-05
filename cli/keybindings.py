"""Key bindings for the REACHER CLI."""

from __future__ import annotations

from typing import TYPE_CHECKING

from prompt_toolkit.key_binding import KeyBindings

from .ui_host import UiHost

if TYPE_CHECKING:
    from prompt_toolkit.key_binding.key_processor import KeyPressEvent


class KeyBindingsMixin(UiHost):
    """Key bindings for every mode, mixed into ``ReacherCLI``."""

    def _build_keybindings(self) -> KeyBindings:
        """Create the key bindings for every mode.

        Up/down move the highlight, Enter selects or submits, Escape goes back, ``q`` quits
        from a menu, and printable keys, Backspace edit the text in input mode.
        """
        kb = KeyBindings()
        self._bind_navigation_keys(kb)
        self._bind_editing_keys(kb)
        return kb

    def _bind_navigation_keys(self, kb: KeyBindings) -> None:
        """Bind arrows, Enter and Escape."""

        @kb.add("up")
        def _up(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                self.menu.move(-1)
                self._invalidate()
            elif self.mode == "select":
                self.select_index = max(0, self.select_index - 1)
                self._invalidate()

        @kb.add("down")
        def _down(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                self.menu.move(1)
                self._invalidate()
            elif self.mode == "select":
                self.select_index = min(len(self.select_options) - 1, self.select_index + 1)
                self._invalidate()

        @kb.add("enter")
        def _enter(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                item = self.menu.items[self.menu.selected]
                if item.action:
                    self._run_action(item.action)
            elif self.mode == "input":
                self._submit_input()
            elif self.mode == "select":
                self._submit_select()

        @kb.add("escape")
        def _escape(event: KeyPressEvent) -> None:
            if self.mode == "monitor":
                self._run_action(self._exit_monitor)
            elif self.mode in ("input", "select"):
                self._cancel_input()
            elif self.mode == "menu" and self.menu.parent:
                self._pop_menu()

    def _bind_editing_keys(self, kb: KeyBindings) -> None:
        """Bind ``q``, Backspace and printable characters."""

        @kb.add("q")
        def _q(event: KeyPressEvent) -> None:
            if self.mode == "menu":
                self._run_action(self._quit)
            elif self.mode == "input":
                self.input_value += "q"
                self._invalidate()

        @kb.add("backspace")
        def _backspace(event: KeyPressEvent) -> None:
            if self.mode == "input" and self.input_value:
                self.input_value = self.input_value[:-1]
                self._invalidate()

        # Printable character input
        @kb.add("<any>")
        def _any_key(event: KeyPressEvent) -> None:
            if self.mode == "input":
                char = event.data
                if char.isprintable() and len(char) == 1:
                    self.input_value += char
                    self._invalidate()
