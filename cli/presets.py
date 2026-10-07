"""Session presets and command dispatch shared with the web UI.

Python port of the web's preset data and the command-building rules that apply
it, so that "SA High" from the CLI configures the board exactly as "SA High"
from the browser. Sources mirrored here:

  web/src/components/program/presets/{frSaPresets,frLitePresets,pavlovianPresets}.ts
  web/src/components/program/devicePresets.ts
  web/src/components/configuration/ConfigurationPanel.tsx  (applySessionPreset)
  web/src/components/monitor/SessionStartModal.tsx         (handleStart)

Data uses the web's own shape (camelCase device keys, nested ``contingency``)
so ``scripts/check-cli-parity.py`` can diff it against the TypeScript
definitions in CI. Stdlib only: the parity check imports this module without
the CLI's runtime dependencies.
"""

from __future__ import annotations

import copy
from typing import Iterable

Command = tuple[int, "int | None"]

# ── Command maps (devicePresets.ts) ──────────────────────────────────────────

LASER_MODE_COMMANDS: dict[str, int] = {
    "contingent": 681, "independent": 682, "rh_lever": 684, "lh_lever": 685,
    "cs_plus": 691, "cs_minus": 692, "cs_both": 693,
}

PAV_LASER_PHASE_COMMANDS: dict[str, int] = {"reward": 694, "cue": 695}

PRESET_COMMAND_MAP: dict[str, dict] = {
    "rhLever":       {"arm": 1001, "disarm": 1000, "params": {"timeout": 1074, "timeoutMode": 1077}},
    "lhLever":       {"arm": 1301, "disarm": 1300, "params": {"timeout": 1374, "timeoutMode": 1377}},
    "primaryCue":    {"arm": 301, "disarm": 300, "params": {"frequency": 371, "duration": 372, "leverFilter": 378, "delay": 377}},
    "secondaryCue":  {"arm": 311, "disarm": 310, "params": {"frequency": 381, "duration": 382, "leverFilter": 388}},
    "primaryPump":   {"arm": 401, "disarm": 400, "params": {"duration": 472, "leverFilter": 478, "delay": 477}},
    "secondaryPump": {"arm": 411, "disarm": 410, "params": {"duration": 482, "leverFilter": 488, "delay": 487}},
    "laser":         {"arm": 601, "disarm": 600, "params": {"frequency": 671, "duration": 672, "delay": 673}},
    "lickCircuit":   {"arm": 501, "disarm": 500},
    "microscope":    {"arm": 901, "disarm": 900},
    "slm":           {"arm": 1101, "disarm": 1100, "params": {"laserFrequency": 1102, "laserDuration": 1103}},
}

# Params the backend does not declare for every paradigm (PARAM_PARADIGMS).
PARAM_PARADIGMS: dict[str, list[str]] = {"timeoutMode": ["fr", "pr"]}

LEVER_COMMANDS = {
    "rh": {"active": 1081, "inactive": 1080, "timeout": 1074, "timeoutMode": 1077, "key": "rhLever"},
    "lh": {"active": 1381, "inactive": 1380, "timeout": 1374, "timeoutMode": 1377, "key": "lhLever"},
}

SET_ACTIVE_PUMP = 221
LEVER_FILTER_VALUES = {"none": 0, "rh": 1, "lh": 2}

# Firmware config-record device names -> web device keys
# (DEVICE_TO_UI_KEY in web/src/hooks/useSessionWebSockets.ts).
DEVICE_TO_UI_KEY: dict[str, str] = {
    "CUE": "primaryCue", "CUE2": "secondaryCue", "PUMP": "primaryPump",
    "PUMP2": "secondaryPump", "LASER": "laser", "LICK": "lickCircuit",
    "MICROSCOPE": "microscope", "LEVER_RH": "rhLever", "LEVER_LH": "lhLever",
    "SLM": "slm",
}

# Web device keys <-> the CLI's kebab-case device ids (DEVICE_CONFIGS in app.py).
CLI_ID: dict[str, str] = {
    "rhLever": "rh-lever", "lhLever": "lh-lever", "primaryCue": "primary-cue",
    "secondaryCue": "secondary-cue", "primaryPump": "primary-pump",
    "secondaryPump": "secondary-pump", "laser": "laser", "lickCircuit": "lick-circuit",
    "microscope": "microscope", "slm": "slm",
}
WEB_KEY: dict[str, str] = {v: k for k, v in CLI_ID.items()}


# ── Paradigm helpers (web/src/lib/paradigm.ts) ───────────────────────────────

def base_paradigm(paradigm: str | None) -> str | None:
    if paradigm is None:
        return None
    p = paradigm.lower()
    return p[: -len("_lite")] if p.endswith("_lite") else p


def is_paradigm(paradigm: str | None, *bases: str) -> bool:
    base = base_paradigm(paradigm)
    return base is not None and base in bases


def is_operant(paradigm: str | None) -> bool:
    return is_paradigm(paradigm, "fr", "pr", "vi", "omission")


def can_dispatch_param(param_key: str, paradigm: str | None) -> bool:
    allowed = PARAM_PARADIGMS.get(param_key)
    return allowed is None or is_paradigm(paradigm, *allowed)


def is_shared_lever_param(device_key: str, param_key: str) -> bool:
    return device_key in ("rhLever", "lhLever") and param_key in ("timeout", "timeoutMode")


def active_lever_of(paradigm_settings: dict | None) -> str:
    return "lh" if (paradigm_settings or {}).get("activeLever") == "lh" else "rh"


def reward_pump2(hw: dict) -> bool:
    """221 value: Pump 2 only when it is the sole armed pump."""
    return bool(hw.get("secondaryPump", {}).get("armed")) and not hw.get("primaryPump", {}).get("armed")


def _filter_targets(hw: dict, lever: str) -> list[str]:
    keys = ("primaryCue", "secondaryCue", "primaryPump", "secondaryPump")
    return [k for k in keys
            if hw.get(k, {}).get("armed")
            and (hw.get(k, {}).get("contingency") or {}).get("leverFilter") == lever]


def lever_scheduler_commands(paradigm: str | None, active: str, hw: dict) -> list[Command]:
    """Active-lever pair, then the one scheduler-wide timeout / timeout mode."""
    if not is_operant(paradigm):
        return []
    other = "lh" if active == "rh" else "rh"
    codes = LEVER_COMMANDS[active]
    src = hw.get(codes["key"], {})
    out: list[Command] = [(codes["active"], None)]
    if not _filter_targets(hw, other):
        out.append((LEVER_COMMANDS[other]["inactive"], None))
    # VI has no timeout, but the firmware boots with a 20 s post-reward lockout. Pin it to 0
    # on every dispatch, armed or not, and never send a mode (mirrors the web).
    if is_paradigm(paradigm, "vi"):
        out.append((codes["timeout"], 0))
        return out
    if not hw.get("rhLever", {}).get("armed") and not hw.get("lhLever", {}).get("armed"):
        return out
    if src.get("timeout") is not None:
        out.append((codes["timeout"], int(src["timeout"])))
    if src.get("timeoutMode") is not None and can_dispatch_param("timeoutMode", paradigm):
        out.append((codes["timeoutMode"], int(src["timeoutMode"])))
    return out


def _laser_commands(paradigm: str | None, laser: dict | None) -> list[Command]:
    laser = laser or {}
    out: list[Command] = []
    if base_paradigm(paradigm) == "pavlovian":
        mode = laser.get("mode")
        if mode:
            if mode not in ("independent", "contingent", "rh_lever", "lh_lever"):
                out.append((681, None))
            out.append((LASER_MODE_COMMANDS[mode], None))
        phase = laser.get("phase")
        if mode != "independent" and phase is not None:
            out.append((PAV_LASER_PHASE_COMMANDS[phase], None))
    elif laser.get("contingency"):
        cmd = {"any": "contingent", "rh": "rh_lever", "lh": "lh_lever",
               "independent": "independent"}[laser["contingency"]]
        out.append((LASER_MODE_COMMANDS[cmd], None))
    return out


def _paradigm_commands(paradigm: str | None, ps: dict, *, at_start: bool) -> list[Command]:
    if is_paradigm(paradigm, "fr", "pr"):
        out: list[Command] = [(201, int(ps.get("ratio", 1)))]
        if at_start and is_paradigm(paradigm, "pr"):
            out.append((205, int(ps.get("step", 1))))
        return out
    if is_paradigm(paradigm, "vi"):
        return [(204, int(ps.get("interval", 30000)))]
    if is_paradigm(paradigm, "omission"):
        return [(203, int(ps.get("interval", 30000)))]
    return []


# ── Hardware state ───────────────────────────────────────────────────────────

_FILTER_NAMES = {0: "none", 1: "rh", 2: "lh"}


def record_command(hw: dict, paradigm_settings: dict, code: int, value: int | None) -> None:
    """Mirror one sent command into local state, so start-time dispatch re-sends it."""
    for key, mapping in PRESET_COMMAND_MAP.items():
        if code == mapping["arm"]:
            hw[key]["armed"] = True
            return
        if code == mapping["disarm"]:
            hw[key]["armed"] = False
            return
        for param, pcode in mapping.get("params", {}).items():
            if code != pcode or value is None:
                continue
            if param in ("timeout", "timeoutMode") and key in ("rhLever", "lhLever"):
                hw["rhLever"][param] = hw["lhLever"][param] = int(value)
            elif param == "leverFilter":
                hw[key].setdefault("contingency", {"leverFilter": "none", "delay": 0})
                hw[key]["contingency"]["leverFilter"] = _FILTER_NAMES.get(int(value), "none")
            elif param == "delay" and key == "laser":
                hw[key]["onsetDelay"] = int(value)
            elif param == "delay":
                hw[key].setdefault("contingency", {"leverFilter": "none", "delay": 0})
                hw[key]["contingency"]["delay"] = int(value)
            else:
                hw[key][param] = int(value)
            return
    laser = hw["laser"]
    if code == 681:
        laser.update(mode="contingent", contingency="any")
    elif code == 682:
        laser.update(mode="independent", contingency="independent")
    elif code == 684:
        laser.update(mode="rh_lever", contingency="rh")
    elif code == 685:
        laser.update(mode="lh_lever", contingency="lh")
    elif code in (691, 692, 693):
        laser["mode"] = {691: "cs_plus", 692: "cs_minus", 693: "cs_both"}[code]
    elif code in (694, 695):
        laser["phase"] = "reward" if code == 694 else "cue"
    elif code in (1081, 1381):
        paradigm_settings["activeLever"] = "rh" if code == 1081 else "lh"
    elif code in (201, 1075, 1375) and value is not None:
        paradigm_settings["ratio"] = int(value)
    elif code == 205 and value is not None:
        paradigm_settings["step"] = int(value)
    elif code in (203, 204) and value is not None:
        paradigm_settings["interval"] = int(value)


def default_hardware() -> dict:
    """defaultHardwareUiState() in web/src/store/useSessionStore.ts, minus guesses.

    Unlike the web (which seeds 0 and lets its device cards overwrite it), the
    CLI never shows an editable value before sending it, so unknown values stay
    None and are skipped by the start-time dispatch.
    """
    def contingency():
        return {"leverFilter": "none", "delay": 0}
    return {
        # None, not the web's 0: the CLI seeds these from the firmware's config
        # dump, and an unknown timeout must never be written to the board as 0.
        "rhLever": {"armed": False, "timeout": None, "timeoutMode": None},
        "lhLever": {"armed": False, "timeout": None, "timeoutMode": None},
        # Frequencies/durations likewise start unknown (None = never sent) and
        # are filled from the board's config dump or the operator's input.
        "primaryCue": {"armed": False, "frequency": None, "duration": None, "contingency": contingency()},
        "secondaryCue": {"armed": False, "frequency": None, "duration": None, "contingency": contingency()},
        "primaryPump": {"armed": False, "duration": None, "contingency": contingency(), "flowRateUlPerSec": None},
        "secondaryPump": {"armed": False, "duration": None, "contingency": contingency(), "flowRateUlPerSec": None},
        "laser": {"armed": False, "frequency": None, "duration": None, "mode": "contingent",
                  "phase": "reward", "contingency": "any", "onsetDelay": 0},
        "lickCircuit": {"armed": False},
        "microscope": {"armed": False, "frameRate": None, "frameAveraging": None},
        "slm": {"armed": False, "pin": 11, "laserFrequency": None, "laserDuration": None},
    }


def merge_firmware_row(hw: dict, row: dict) -> str | None:
    """Fold one firmware config record into ``hw`` like the web's config handler.

    Returns the web device key that changed, or None.
    """
    device = str(row.get("device", ""))
    if device in ("LEVER_RH", "LEVER_LH", "CONTROLLER"):
        shared = {}
        if isinstance(row.get("timeout"), (int, float)) and not isinstance(row.get("timeout"), bool):
            shared["timeout"] = int(row["timeout"])
        if isinstance(row.get("timeout_mode"), (int, float)) and not isinstance(row.get("timeout_mode"), bool):
            shared["timeoutMode"] = int(row["timeout_mode"])
        for k in ("rhLever", "lhLever"):
            hw.setdefault(k, {}).update(shared)
    key = DEVICE_TO_UI_KEY.get(device)
    if not key or key not in hw:
        return None
    cur = hw[key]
    if isinstance(row.get("armed"), bool):
        cur["armed"] = row["armed"]
    for f in ("frequency", "duration", "timeout"):
        v = row.get(f)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            cur[f] = int(v)
    return key


def merge_controller_row(paradigm_settings: dict, row: dict) -> None:
    """Pick scheduler-wide values (ratio, active lever) out of a CONTROLLER record."""
    if row.get("device") != "CONTROLLER":
        return
    if isinstance(row.get("ratio"), int) and not isinstance(row.get("ratio"), bool):
        paradigm_settings["ratio"] = row["ratio"]
    lever = str(row.get("active_lever", "")).lower()
    if lever in ("rh", "lh"):
        paradigm_settings["activeLever"] = lever


def merge_preset_hardware(hw: dict, preset: dict) -> dict:
    """applySessionPreset step 1: full-takeover merge of preset hardware."""
    out = copy.deepcopy(hw)
    for key, value in preset["hardware"].items():
        if key not in out:
            continue
        armed = value.get("armed")
        if armed is False:
            out[key] = {**out[key], "armed": False}
        else:
            out[key] = {**out[key], **copy.deepcopy(value), "armed": armed}
    for key in PRESET_COMMAND_MAP:
        if key not in preset["hardware"] and key in out:
            out[key]["armed"] = False
    src = out["lhLever" if active_lever_of(preset.get("paradigmSettings")) == "lh" else "rhLever"]
    for k in ("rhLever", "lhLever"):
        out[k] = {**out[k], "timeout": src.get("timeout"), "timeoutMode": src.get("timeoutMode")}
    return out


# ── Command builders ─────────────────────────────────────────────────────────

def preset_commands(preset: dict, paradigm: str | None, merged_hw: dict) -> list[Command]:
    """Commands applySessionPreset sends in the connected/stopped states."""
    is_pav = base_paradigm(paradigm) == "pavlovian"
    out: list[Command] = []
    for key, state in preset["hardware"].items():
        mapping = PRESET_COMMAND_MAP.get(key)
        if not mapping:
            continue
        if key in ("rhLever", "lhLever") and is_pav:
            continue
        armed = state.get("armed")
        if armed is not None:
            out.append((mapping["arm"] if armed else mapping["disarm"], None))
        for param_key, code in mapping.get("params", {}).items():
            if not can_dispatch_param(param_key, paradigm):
                continue
            if is_shared_lever_param(key, param_key):
                continue
            v = state.get(param_key)
            if v is not None and not isinstance(v, (dict, str)):
                out.append((code, int(v)))
    for key, mapping in PRESET_COMMAND_MAP.items():
        if key not in preset["hardware"]:
            out.append((mapping["disarm"], None))
    if not is_pav:
        out.append((SET_ACTIVE_PUMP, int(reward_pump2(preset["hardware"]))))
    out += _laser_commands(paradigm, preset["hardware"].get("laser"))
    if "rhLever" in preset["hardware"] or "lhLever" in preset["hardware"]:
        out += lever_scheduler_commands(paradigm, active_lever_of(preset.get("paradigmSettings")), merged_hw)
    if preset.get("pavlovianParams"):
        out += [(int(c), int(v)) for c, v in preset["pavlovianParams"].items()]
    else:
        out += _paradigm_commands(paradigm, preset.get("paradigmSettings", {}), at_start=False)
    return out


def start_commands(paradigm: str | None, hw: dict, paradigm_settings: dict,
                   pavlovian_params: dict | None) -> list[Command]:
    """Commands SessionStartModal.handleStart sends before start/arm.

    Re-sends the whole configuration so a stale or replayed firmware state
    (reconnect, earlier session on the same board) cannot leak into the run.
    """
    is_pav = base_paradigm(paradigm) == "pavlovian"
    press_contingent = not is_pav and base_paradigm(paradigm) != "omission"
    out: list[Command] = []
    if is_pav and pavlovian_params:
        out += [(int(c), int(v)) for c, v in pavlovian_params.items()]
    if not is_pav:
        out += _paradigm_commands(paradigm, paradigm_settings, at_start=True)
    for key, state in hw.items():
        mapping = PRESET_COMMAND_MAP.get(key)
        if not mapping or not state.get("armed"):
            continue
        if key in ("rhLever", "lhLever") and is_pav:
            continue
        out.append((mapping["arm"], None))
        params = mapping.get("params")
        if not params:
            continue
        for param_key, code in params.items():
            if not can_dispatch_param(param_key, paradigm) or is_shared_lever_param(key, param_key):
                continue
            v = state.get(param_key)
            if v is not None and not isinstance(v, (dict, str)):
                out.append((code, int(v)))
        cont = state.get("contingency")
        if isinstance(cont, dict):
            if press_contingent and cont.get("leverFilter") is not None and "leverFilter" in params:
                out.append((params["leverFilter"], LEVER_FILTER_VALUES.get(cont["leverFilter"], 0)))
            if cont.get("delay") and cont["delay"] > 0 and "delay" in params:
                out.append((params["delay"], int(cont["delay"])))
    out += _laser_commands(paradigm, hw.get("laser"))
    if is_operant(paradigm):
        out += lever_scheduler_commands(paradigm, active_lever_of(paradigm_settings), hw)
        out.append((SET_ACTIVE_PUMP, int(reward_pump2(hw))))
    return out


def limit_payload(limits: dict) -> dict:
    """POST /api/program/{id}/limit body with only the relevant fields."""
    t = limits.get("limitType", "Time")
    body: dict = {"type": t}
    if t in ("Time", "Both"):
        body["time_limit"] = int(limits.get("timeLimit", 3600))
    if t in ("Infusion", "Both", "Trials"):
        body["infusion_limit"] = int(limits.get("infusionLimit", 30))
        body["delay"] = int(limits.get("delay", 10))
    return body


def filter_allowed(cmds: Iterable[Command], allowed: set[int] | None) -> tuple[list[Command], list[int]]:
    """Split commands into those the firmware declares and those it does not.

    The backend 400s a code not declared for the session's paradigm. That
    matters for ``_lite`` builds, which have no microscope/SLM commands but
    still get their disarm from the full-takeover loop.
    """
    cmds = list(cmds)
    if not allowed:
        return cmds, []
    kept = [c for c in cmds if c[0] in allowed]
    dropped = [c[0] for c in cmds if c[0] not in allowed]
    return kept, dropped


# ── Preset data ──────────────────────────────────────────────────────────────

def _cont(lever_filter: str, delay: int) -> dict:
    return {"leverFilter": lever_filter, "delay": delay}


_FR_CORE = {
    "rhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
    "lhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
    "primaryCue": {"armed": True, "frequency": 8000, "duration": 1600, "contingency": _cont("rh", 0)},
}
_FR_PUMP = {
    "primaryPump": {"armed": True, "duration": 2000, "contingency": _cont("rh", 1600), "flowRateUlPerSec": None},
}
_FR_OPTIONAL = {
    "laser": {"armed": False, "frequency": 40, "duration": 5000, "mode": "contingent",
              "contingency": "any", "onsetDelay": 0},
    "lickCircuit": {"armed": False},
    "microscope": {"armed": False, "frameRate": None, "frameAveraging": None},
    "slm": {"armed": False, "pin": 11, "laserFrequency": None, "laserDuration": None},
    "secondaryCue": {"armed": False, "frequency": 2900, "duration": 1000, "contingency": _cont("none", 0)},
    "secondaryPump": {"armed": False, "duration": 3000, "contingency": _cont("none", 0), "flowRateUlPerSec": None},
}
_FR_LITE_OPTIONAL = {k: v for k, v in _FR_OPTIONAL.items() if k not in ("microscope", "slm")}
_FR_SETTINGS = {"ratio": 1, "step": 1, "interval": 30000}


def _limits(limit_type: str, time_limit: int, infusion_limit: int, delay: int = 10) -> dict:
    return {"limitType": limit_type, "timeLimit": time_limit, "infusionLimit": infusion_limit, "delay": delay}


def _sa(pid: str, name: str, label: str, paradigm: str, optional: dict, infusions: int) -> dict:
    return {
        "id": pid, "name": name, "menuLabel": label, "paradigm": paradigm,
        "hardware": {**_FR_CORE, **_FR_PUMP, **optional},
        "paradigmSettings": _FR_SETTINGS,
        "limitDefaults": _limits("Both", 3600, infusions),
    }


def _extinction(pid: str, name: str, paradigm: str, optional: dict, pump_flow: bool) -> dict:
    pump = {"armed": False, "duration": 2000, "contingency": _cont("none", 1600)}
    if pump_flow:
        pump["flowRateUlPerSec"] = None
    return {
        "id": pid, "name": name, "menuLabel": "SA Extinction", "paradigm": paradigm,
        "hardware": {
            "rhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
            "lhLever": {"armed": True, "timeout": 20000, "timeoutMode": 0},
            "primaryCue": {"armed": False, "frequency": 8000, "duration": 1600, "contingency": _cont("none", 0)},
            "primaryPump": pump,
            **optional,
        },
        "paradigmSettings": _FR_SETTINGS,
        "limitDefaults": _limits("Time", 3600, 30),
    }


_PAV_CORE = {
    "primaryCue": {"armed": True, "frequency": 12000, "duration": 2000, "contingency": _cont("none", 0)},
    "secondaryCue": {"armed": True, "frequency": 3000, "duration": 2000, "contingency": _cont("none", 0)},
    "primaryPump": {"armed": True, "duration": 2000, "contingency": _cont("none", 0), "flowRateUlPerSec": None},
}
_PAV_LASER = {"armed": True, "frequency": 40, "duration": 5000, "mode": "cs_plus", "phase": "reward",
              "contingency": "any", "onsetDelay": 0}
_PAV_OPTIONAL = {
    "laser": {**_PAV_LASER, "armed": False},
    "lickCircuit": {"armed": True},
    "microscope": {"armed": False, "frameRate": None, "frameAveraging": None},
    "slm": {"armed": False, "pin": 11, "laserFrequency": None, "laserDuration": None},
}
_PAV_PARAMS_COMMON = {
    208: 50, 209: 50, 210: 12000, 211: 3000, 212: 0, 213: 2000, 214: 1000, 215: 5000,
    216: 30000, 217: 20000, 218: 50000, 219: 0, 374: 0, 375: 0, 384: 200, 385: 200,
}


def _pav(pid: str, name: str, label: str, cs_plus_prob: int, cs_minus_prob: int) -> dict:
    return {
        "id": pid, "name": name, "menuLabel": label, "paradigm": "pavlovian",
        "hardware": {**_PAV_CORE, **_PAV_OPTIONAL, "laser": dict(_PAV_LASER), "lickCircuit": {"armed": True}},
        "paradigmSettings": {"ratio": 1, "step": 1, "interval": 0},
        "pavlovianParams": {206: cs_plus_prob, 207: cs_minus_prob, **_PAV_PARAMS_COMMON},
        "limitDefaults": _limits("Trials", 7200, 100),
    }


SESSION_PRESETS: list[dict] = [
    _sa("sa-high", "Self-Administration - High Day", "SA High", "fr", _FR_OPTIONAL, 10),
    _sa("sa-mid", "Self-Administration - Mid Day", "SA Mid", "fr", _FR_OPTIONAL, 20),
    _sa("sa-low", "Self-Administration - Low Day", "SA Low", "fr", _FR_OPTIONAL, 40),
    _extinction("sa-extinction", "Self-Administration - Extinction", "fr", _FR_OPTIONAL, True),
    _sa("sa-high-lite", "Self-Administration - High Day (Lite)", "SA High", "fr_lite", _FR_LITE_OPTIONAL, 10),
    _sa("sa-mid-lite", "Self-Administration - Mid Day (Lite)", "SA Mid", "fr_lite", _FR_LITE_OPTIONAL, 20),
    _sa("sa-low-lite", "Self-Administration - Low Day (Lite)", "SA Low", "fr_lite", _FR_LITE_OPTIONAL, 40),
    _extinction("sa-extinction-lite", "Self-Administration - Extinction (Lite)", "fr_lite", _FR_LITE_OPTIONAL, False),
    _pav("pav-acquisition", "Pavlovian - Acquisition", "Acquisition", 100, 0),
    _pav("pav-reversal", "Pavlovian - Reversal", "Reversal", 0, 100),
]

PRESET_BY_ID: dict[str, dict] = {p["id"]: p for p in SESSION_PRESETS}


def presets_for(paradigm: str | None) -> list[dict]:
    """Built-in presets offered for a session (exact paradigm match, as the web does)."""
    p = (paradigm or "").lower()
    return [preset for preset in SESSION_PRESETS if preset["paradigm"] == p]
