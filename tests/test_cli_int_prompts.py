"""Known-bug regression: CLI integer prompts never apply the typed value.

``ReacherCLI._prompt_int_input`` validates the text, then calls the menu
callback and discards the coroutine that callback returns. ``_run_action``
therefore never awaits ``_set_limit_value`` / ``_send_paradigm_setting`` /
``_send_hw_command`` / ``_set_pavlovian_param`` / ``_send_pavlovian_iti``.
The session keeps its previous number (Set Time Limit: typed 6, stayed
3600) and Python emits ``RuntimeWarning: coroutine '...' was never awaited``.

These tests drive the same menus and Enter handling as the terminal. They
must keep failing until that coroutine is awaited. Do not weaken an
assertion to make a case pass.

Choice-list prompts (lever timeout mode, lever filter, Pavlovian
counterbalance code 212) call ``_prompt_select``, which does return its
coroutine, so they are not part of this bug.

Run from the repo root after installing the CLI extras (prompt_toolkit, httpx)::

    python -m unittest discover -s tests -v

No serial port, firmware upload, or live backend is contacted. The HTTP
client constructed by ``ReacherCLI`` is closed unused and replaced with
``FakeApi``.
"""

from __future__ import annotations

import asyncio
import gc
import unittest
import warnings
from dataclasses import dataclass

from cli.app import (
    DEVICE_CONFIGS,
    ITI_CODES,
    PAV_LABEL_OVERRIDES,
    PULSE_CODES,
    ReacherCLI,
    SessionState,
)
from cli.presets import WEB_KEY

# Code 212 is a checkbox in the web UI and a ``_prompt_select`` in the CLI.
BOOL_PAV_CODES = {212}

# Valid against ITI_DEFAULTS (min 10000, mean 30000, max 90000) when nothing
# has been stored yet. A value that fails Min <= Mean <= Max would stay
# unapplied even after the coroutine is awaited.
ITI_TYPED = {216: 45000, 217: 6, 218: 100000}

PAVLOVIAN_COMMANDS = [
    {
        "code": code,
        "name": f"CODE_{code}",
        "description": label,
        "payload_key": "value",
        "payload_type": "bool" if code in BOOL_PAV_CODES else "int",
    }
    for code, label in sorted(PAV_LABEL_OVERRIDES.items())
]


@dataclass(frozen=True)
class IntPromptCase:
    """One menu item whose action is a ``_prompt_int_input`` callback."""

    name: str
    caller: str
    root: str  # "program" or "hardware"
    path: tuple[str, ...]
    prompt_label: str
    typed: int
    kind: str  # limit | paradigm | hardware | pav
    paradigm: str = "fr"
    limit_type: str = "Time"
    load_pavlovian_commands: bool = False
    state_key: str = ""
    code: int | None = None
    device_id: str | None = None
    hw_key: str | None = None


def _hardware_cases() -> list[IntPromptCase]:
    cases = []
    for cfg in DEVICE_CONFIGS:
        for param in cfg.get("params", []):
            if param.get("choices"):
                continue
            key = param["key"]
            ident = f"{cfg['id']}_{key}".replace("-", "_")
            cases.append(IntPromptCase(
                name=f"hw_{ident}",
                caller=(
                    "cli/app.py:728 _device_menu numeric param "
                    f"{cfg['label']} / {param['label']} (code {param['code']})"
                ),
                root="hardware",
                path=(cfg["label"],),
                prompt_label=f"Set {param['label']}",
                typed=6,
                kind="hardware",
                code=param["code"],
                device_id=cfg["id"],
                hw_key=key,
            ))
    return cases


def _paradigm_cases() -> list[IntPromptCase]:
    rows = [
        ("fr", "Set Ratio", "ratio", 201, 5, "paradigm_fr_ratio",
         "cli/app.py:812 _paradigm_settings_menu Set Ratio"),
        ("pr", "Set Ratio", "ratio", 201, 8, "paradigm_pr_ratio",
         "cli/app.py:812 _paradigm_settings_menu Set Ratio"),
        ("pr", "Set PR Step", "step", 205, 9, "paradigm_pr_step",
         "cli/app.py:816 _paradigm_settings_menu Set PR Step"),
        ("vi", "Set VI Interval (ms)", "interval", 204, 12345, "paradigm_vi_interval",
         "cli/app.py:820 _paradigm_settings_menu Set VI Interval"),
        ("omission", "Set Omission Interval (ms)", "interval", 203, 23456,
         "paradigm_omission_interval",
         "cli/app.py:824 _paradigm_settings_menu Set Omission Interval"),
    ]
    cases = []
    for paradigm, label, key, code, typed, name, caller in rows:
        cases.append(IntPromptCase(
            name=name,
            caller=caller,
            root="program",
            path=("Paradigm Settings",),
            prompt_label=label,
            typed=typed,
            kind="paradigm",
            paradigm=paradigm,
            state_key=key,
            code=code,
        ))
    return cases


def _limit_cases() -> list[IntPromptCase]:
    # Limit type is part of the fixture so the value is one the running
    # session would actually send (Time posts time_limit; Infusion posts
    # infusion_limit and delay; Both posts all three).
    rows = [
        ("time_limit", "Set Time Limit (s)", 6, "Time", "limit_time",
         "cli/app.py:907 _limits_menu Set Time Limit"),
        ("infusion_limit", "Set Infusion Limit", 11, "Infusion", "limit_infusion",
         "cli/app.py:911 _limits_menu Set Infusion Limit"),
        ("delay", "Set Delay (s)", 4, "Both", "limit_delay",
         "cli/app.py:915 _limits_menu Set Delay"),
    ]
    return [
        IntPromptCase(
            name=name,
            caller=caller,
            root="program",
            path=("Limits",),
            prompt_label=label,
            typed=typed,
            kind="limit",
            limit_type=limit_type,
            state_key=key,
        )
        for key, label, typed, limit_type, name, caller in rows
    ]


def _pavlovian_cases() -> list[IntPromptCase]:
    cases = []
    for spec in PAVLOVIAN_COMMANDS:
        code = spec["code"]
        if code in PULSE_CODES:
            kind_name = "pulse"
            caller = "cli/app.py:886 _pavlovian_menu pulse _prompt_int_input"
        elif code in ITI_CODES:
            kind_name = "iti"
            caller = "cli/app.py:861 _pavlovian_menu ITI _prompt_int_input"
        elif spec["payload_type"] == "bool":
            continue
        else:
            kind_name = "scalar"
            caller = "cli/app.py:871 _pavlovian_menu scalar _prompt_int_input"
        label = PAV_LABEL_OVERRIDES[code]
        cases.append(IntPromptCase(
            name=f"pav_{kind_name}_{code}",
            caller=f"{caller} code {code} ({label})",
            root="program",
            path=("Pavlovian Settings",),
            prompt_label=f"Set {label}",
            typed=ITI_TYPED.get(code, 6),
            kind="pav",
            paradigm="pavlovian",
            load_pavlovian_commands=True,
            code=code,
        ))
    return cases


CASES = _limit_cases() + _paradigm_cases() + _hardware_cases() + _pavlovian_cases()


class FakeApi:
    """Records the two writes integer prompts are supposed to make."""

    def __init__(self):
        self.commands: list[tuple] = []
        self.limits: list[dict] = []

    async def send_command(self, sid, code, value=None):
        self.commands.append((sid, int(code), None if value is None else int(value)))
        return {"status": "ok"}

    async def set_limit(self, sid, limit_type, **kw):
        self.limits.append({"sid": sid, "type": limit_type, **kw})
        return {"status": "ok"}


class BackgroundApp:
    """Stand-in for ``prompt_toolkit.Application.create_background_task``.

    ``_run_action`` does nothing unless ``self.app`` is set. A real
    Application would take over the terminal; this only schedules the
    coroutine on the running loop.
    """

    def __init__(self):
        self._tasks: list[asyncio.Task] = []

    def create_background_task(self, coro):
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.append(task)
        return task

    def invalidate(self):
        return None

    async def drain(self):
        while True:
            pending = [task for task in self._tasks if not task.done()]
            if not pending:
                self._tasks.clear()
                return
            await asyncio.gather(*pending)


def _applied_hardware(session: SessionState, device_id: str, key: str):
    """Where ``record_command`` stores a numeric hardware prompt."""
    web = WEB_KEY[device_id]
    dev = session.hw[web]
    if key == "ratio":
        return "paradigm_settings.ratio", session.paradigm_settings.get("ratio")
    if key == "timeout":
        return (
            "hw.rhLever.timeout, hw.lhLever.timeout",
            (session.hw["rhLever"].get("timeout"), session.hw["lhLever"].get("timeout")),
        )
    if key == "onsetDelay":
        return f"hw.{web}.onsetDelay", dev.get("onsetDelay")
    if key == "delay":
        contingency = dev.get("contingency") or {}
        return f"hw.{web}.contingency.delay", contingency.get("delay")
    return f"hw.{web}.{key}", dev.get(key)


class CliIntPromptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._real_clients = []

    async def asyncTearDown(self):
        for client in self._real_clients:
            await client.close()

    def _make_cli(self, case: IntPromptCase) -> ReacherCLI:
        cli = ReacherCLI(port=1)
        self._real_clients.append(cli.api)
        cli.api = FakeApi()
        cli.app = BackgroundApp()
        cli.session = SessionState(
            id="sess-1",
            port="SIM1",
            paradigm=case.paradigm,
            state="connected",
        )
        cli.session.limit_settings["type"] = case.limit_type
        if case.load_pavlovian_commands:
            cli.session.pav_commands = [dict(spec) for spec in PAVLOVIAN_COMMANDS]
        return cli

    def _focus(self, cli: ReacherCLI, label: str) -> None:
        matches = [
            index for index, item in enumerate(cli.menu.items)
            if item.label == label and not item.is_separator
        ]
        labels = [item.label for item in cli.menu.items]
        self.assertEqual(
            len(matches), 1,
            f"{label!r} not in menu {cli.menu.title!r}: {labels}",
        )
        cli.menu.selected = matches[0]

    def _press_enter(self, cli: ReacherCLI) -> None:
        # Same branches as the Enter binding in ``_build_keybindings``.
        if cli.mode == "menu":
            item = cli.menu.items[cli.menu.selected]
            if item.action and not item.is_separator:
                cli._run_action(item.action)
        elif cli.mode == "input":
            cli._submit_input()
        elif cli.mode == "select":
            cli._submit_select()

    async def _activate(self, cli: ReacherCLI, label: str) -> None:
        self._focus(cli, label)
        self._press_enter(cli)
        await cli.app.drain()

    def _failure(self, case: IntPromptCase, cli: ReacherCLI, never, observed: str) -> str:
        warns = [f"{item.category.__name__}: {item.message}" for item in never]
        return (
            f"{case.caller}: typed {case.typed} was not applied. "
            f"{observed} status={cli.status_message!r} unawaited={warns}"
        )

    def _assert_applied(self, case: IntPromptCase, cli: ReacherCLI, never) -> None:
        api: FakeApi = cli.api
        if case.kind == "limit":
            got = cli.session.limit_settings.get(case.state_key)
            observed = (
                f"limit_settings[{case.state_key}]={got!r} "
                f"sent_limits={api.limits}"
            )
            msg = self._failure(case, cli, never, observed)
            self.assertEqual(got, case.typed, msg)
            self.assertEqual(len(api.limits), 1, msg)
            self.assertEqual(api.limits[0].get("sid"), "sess-1", msg)
            self.assertEqual(api.limits[0].get("type"), case.limit_type, msg)
            self.assertEqual(api.limits[0].get(case.state_key), case.typed, msg)
        elif case.kind == "paradigm":
            got = cli.session.paradigm_settings.get(case.state_key)
            observed = (
                f"paradigm_settings[{case.state_key}]={got!r} "
                f"sent_commands={api.commands}"
            )
            msg = self._failure(case, cli, never, observed)
            self.assertEqual(got, case.typed, msg)
            self.assertEqual(api.commands, [("sess-1", case.code, case.typed)], msg)
        elif case.kind == "hardware":
            where, got = _applied_hardware(cli.session, case.device_id, case.hw_key)
            expected = (case.typed, case.typed) if case.hw_key == "timeout" else case.typed
            observed = f"{where}={got!r} sent_commands={api.commands}"
            msg = self._failure(case, cli, never, observed)
            self.assertEqual(got, expected, msg)
            self.assertEqual(api.commands, [("sess-1", case.code, case.typed)], msg)
        elif case.kind == "pav":
            got = cli.session.pavlovian_params.get(case.code)
            observed = (
                f"pavlovian_params[{case.code}]={got!r} "
                f"sent_commands={api.commands}"
            )
            msg = self._failure(case, cli, never, observed)
            self.assertEqual(got, case.typed, msg)
            self.assertEqual(api.commands, [("sess-1", case.code, case.typed)], msg)
        else:
            self.fail(f"unknown case kind {case.kind}")
        self.assertEqual(
            [str(item.message) for item in never],
            [],
            f"{case.caller}: RuntimeWarning coroutine was never awaited",
        )

    async def _exercise(self, case: IntPromptCase) -> None:
        cli = self._make_cli(case)
        cli.menu = cli._hardware_menu() if case.root == "hardware" else cli._program_menu()
        for label in case.path:
            await self._activate(cli, label)
        await self._activate(cli, case.prompt_label)
        self.assertEqual(
            cli.mode,
            "input",
            (
                f"{case.caller}: integer prompt did not open for {case.prompt_label!r} "
                f"(mode={cli.mode!r}, menu={cli.menu.title!r}, "
                f"status={cli.status_message!r})"
            ),
        )
        self.assertEqual(cli.input_value, "")
        for char in str(case.typed):
            self.assertTrue(char.isprintable() and len(char) == 1)
            cli.input_value += char
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self._press_enter(cli)
            await cli.app.drain()
            gc.collect()
        never = [
            item for item in caught
            if issubclass(item.category, RuntimeWarning)
            and "was never awaited" in str(item.message)
        ]
        self._assert_applied(case, cli, never)


def _bind(case: IntPromptCase):
    async def test(self):
        await self._exercise(case)

    test.__name__ = f"test_{case.name}"
    test.__doc__ = case.caller
    return test


for _case in CASES:
    setattr(CliIntPromptTests, f"test_{_case.name}", _bind(_case))


if __name__ == "__main__":
    unittest.main()
