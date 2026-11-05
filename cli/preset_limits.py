"""Session limit defaults, validation and request bodies (web/src/lib/limits.ts)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from .preset_tables import Command

# Zero means "not set yet", as in the web (web/src/lib/limits.ts LIMIT_DEFAULTS).
LIMIT_DEFAULTS = {"timeLimit": 0, "infusionLimit": 0, "delay": 0}
MAX_TIME_LIMIT_S = 86400
MAX_INFUSION_LIMIT = 10000
MAX_STOP_DELAY_S = 86400

LimitSettings = Mapping[str, object]
LimitBody = dict[str, object]


def read_limit_number(limits: LimitSettings, key: str) -> int:
    """Read one numeric limit as an int; a missing or non-numeric value counts as 0 (not set)."""
    value = limits.get(key, 0)
    return int(value) if isinstance(value, (int, float, str)) else 0


def missing_limit_fields(limits: LimitSettings) -> list[str]:
    """Labels of the limits that must be set before a session can start (web getMissingLimitFields)."""
    t = limits.get("limitType", "Time")
    missing: list[str] = []
    if t in ("Time", "Both") and not 1 <= read_limit_number(limits, "timeLimit") <= MAX_TIME_LIMIT_S:
        missing.append("Time Limit (s)")
    if t in ("Infusion", "Both"):
        if not 1 <= read_limit_number(limits, "infusionLimit") <= MAX_INFUSION_LIMIT:
            missing.append("Infusion Limit")
        if not 0 <= read_limit_number(limits, "delay") <= MAX_STOP_DELAY_S:
            missing.append("Stop Delay (s)")
    return missing


def limit_payload(limits: LimitSettings) -> LimitBody | None:
    """POST /api/program/{id}/limit body for the limits set so far, or None if none are.

    The backend rejects a 0 limit and a type whose limit is missing, so this
    mirrors the web's buildLimitPayload: a "Both" with only the time limit
    set goes out as "Time" until the infusion limit is set too.
    """
    t = limits.get("limitType", "Time")
    if t == "Trials":
        return {"type": "Trials"}
    time_limit = read_limit_number(limits, "timeLimit")
    infusion_limit = read_limit_number(limits, "infusionLimit")
    delay = read_limit_number(limits, "delay")
    has_time = t in ("Time", "Both") and 1 <= time_limit <= MAX_TIME_LIMIT_S
    has_infusion = t in ("Infusion", "Both") and 1 <= infusion_limit <= MAX_INFUSION_LIMIT
    if has_time and has_infusion:
        sent_type = "Both"
    elif has_time:
        sent_type = "Time"
    elif has_infusion:
        sent_type = "Infusion"
    else:
        return None
    body: LimitBody = {"type": sent_type}
    if has_time:
        body["time_limit"] = time_limit
    if has_infusion:
        body["infusion_limit"] = infusion_limit
        if 0 <= delay <= MAX_STOP_DELAY_S:
            body["delay"] = delay
        # Explicit null is sent on purpose: it means Auto, not "leave unchanged".
        body["counted_pumps"] = limits.get("countedPumps")
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
