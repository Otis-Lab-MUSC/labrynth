# Multi-host validation checklist (issue #16)

Reproducible procedure for validating multi-machine IoT control across **two or
more live REACHER hosts**. The architecture is implemented and the backend has
automated coverage (see below); these are the acceptance-criteria checks that can
only be confirmed against real hardware on a real network.

## Why a manual checklist

Code inspection + the `reacher` test suite (`tests/test_multimachine.py`) confirm the
*mechanism* — per-machine credential routing, three-source discovery merge, rate-limited
pairing, and per-session `machineId` keying. They cannot confirm runtime behavior that
depends on two physical hosts, real mDNS multicast, and concurrent serial sessions. This
doc closes that gap.

**Already covered automatically (no hardware needed):**

- Pairing brute-force rate limit (5/IP/60 s) + rotating-code validation — `reacher` `tests/test_multimachine.py::TestPairingRateLimit`, `::TestPairingCode`.
- Discovery three-source merge precedence (mDNS > subnet-scan > unicast) + `REACHER_BROKER_URL` unicast `/register` fallback — `::TestDiscoveryMerge`.
- Proxy per-machine credential routing + no cross-machine credential bleed + ws-token returns the *local* key — `::TestProxyIsolation`.

**Frontend isolation (confirmed by inspection):** `web/src/services/sessionClient.ts`
resolves every command via `session.machineId → useMachineStore.getClient(machineId)`;
sessions are keyed by id in a `Map<string, Session>` (`web/src/store/useSessionStore.ts`),
each carrying its own `machineId`. There is no shared/global device client, so state cannot
bleed across hosts at the store layer.

## Prerequisites

- Two remote REACHER hosts (e.g. Raspberry Pi per chamber), each with an Arduino flashed and on the same LAN. Call them **Host A** and **Host B**.
- One machine running Labrynth (the controller).
- Each host running `python -m reacher`; pairing code visible on each host's terminal (or via `reacher-monitor`).

---

## AC-1 — Two hosts paired and listed simultaneously

1. On each host, note the 6-digit pairing code from its terminal.
2. In Labrynth, pair Host A (enter A's code), then Host B (enter B's code).
3. ✅ **Pass:** both A and B appear in the machine list at once, each shown online.
4. Restart Labrynth (or clear/restore localStorage) → ✅ both machines auto-restore and reconnect.

## AC-2 — Independent sessions, no cross-host state bleed

1. Start a session on Host A (e.g. FR paradigm) and a *different* session on Host B (e.g. Pavlovian).
2. Trigger behavior on A only (e.g. a lever press / cue).
3. ✅ **Pass:** A's monitor reflects the event; **B's session is unchanged** (no event count change, no state flip). Repeat with roles reversed.
4. Pause A → ✅ B keeps running. Stop B → ✅ A is unaffected.

## AC-3 — Discovery: mDNS on a standard network, unicast fallback on a blocked one

1. **Standard LAN (mDNS allowed):** with both hosts up, confirm each is discoverable in Labrynth without manual URL entry. ✅ **Pass:** both appear via mDNS.
2. **Multicast-blocked network (e.g. managed university switch):** set `REACHER_BROKER_URL=http://<controller-host>:6229` on each host before launch. ✅ **Pass:** hosts self-register via unicast `POST /api/discovery/register` and still appear in Labrynth despite mDNS being unavailable.

## AC-4 — Per-host hardware panel layout

1. Open the hardware panel for the Host A session and the Host B session.
2. ✅ **Pass:** each panel renders the lever/cue layout for *its own* paradigm/board (e.g. A's FR levers vs. B's Pavlovian cues), with no mixing. Commands sent from A's panel affect only A.

## AC-5 — Preset application to a specific remote device

1. From the controller, apply a saved preset to the Host A session.
2. ✅ **Pass:** A's hardware reconfigures (verify ARM/DISARM + param commands land — confirm on A's monitor/serial) and **B is untouched**.
3. Apply a *different* preset to B → ✅ B reconfigures independently.

---

## Recording results

Tick each AC above against a dated run (firmware version, board, network type). File any
failure as a new issue referencing #16 with the AC number, host count, and network
conditions. When all five pass on a 2-host run, #16 can be closed as validated.

## Cross-repo note

The backend (pairing/discovery/proxy) and the automated tests above live in the **separate
`reacher` repo** (branch `test/multi-machine-validation-16`). Merging the frontend side of
#16 does not pull those tests in — they ship with `reacher`. Consider a `reacher` tracking
issue so that coverage is tracked in its own repo.
