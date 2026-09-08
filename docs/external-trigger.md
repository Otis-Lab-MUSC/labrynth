# External start trigger

Start a session from a hardware TTL edge instead of the **Start Session** button,
so the rig can follow an external instrument (a two-photon scope's own sequencer,
a Master-8, a DAQ) rather than lead it.

This is an **additive** mode. The software start button is unchanged and remains
the default; nothing about an existing workflow changes unless you opt in.

## Requirements

- **Arduino Mega 2560.** The feature is stripped from the UNO `_lite` firmware
  alongside two-photon support — the UNO's only interrupt pins are 2 (the fixed
  microscope timestamp input) and 3 (the primary cue), so it has none to spare.
- Firmware built with external-trigger support. Labrynth detects this by asking
  the board which commands it accepts, so the **External Trigger** card and the
  **Start Mode** section simply do not appear on firmware that lacks it.

## Wiring

| | |
|---|---|
| Default pin | **18** (INT5) |
| Assignable pins | **18, 19, 20, 21** (INT5, INT4, INT3, INT2) |
| Edge | Rising |
| Logic level | 5 V TTL |

Connect the trigger source's output to the chosen pin and **tie the two grounds
together** — a signal wire alone will float and produce spurious edges or none at
all.

**3.3 V sources are marginal.** The ATmega2560 at 5 V specifies V_IH ≈ 0.6 × Vcc
≈ 3.0 V, so a 3.3 V logic high has almost no margin over temperature and cable
loss. Use a level shifter rather than relying on it.

**Only 18–21 are offered, and that restriction is load-bearing.** Pins 2 and 3
are interrupt-capable but already spoken for: pin 2 is the microscope frame
timestamp (INT0) and pin 3 is the primary cue. Assigning the trigger to pin 2
would replace the frame-timestamp interrupt handler, and two-photon frame
timestamping would stop silently — no error, the frame stream just goes quiet,
and you would not find out until you opened the exported data.

**These four pins are dual-purpose.** On the Mega, 18/19 are Serial1 TX/RX and
20/21 are I2C SDA/SCL. No current REACHER firmware uses either peripheral, so any
of the four is safe today — but if you later add an I2C sensor or a second serial
device, pick the trigger pin accordingly.

## Using it

1. Connect the board and configure the session exactly as you normally would.
   Set the trigger pin in **Configuration → External Trigger** if you are not
   using the default.
2. Open **Start Session**. Under **Start Mode**, choose **Wait for external
   trigger**. The button becomes **Arm for Trigger**.
3. Press it. The session moves to **armed**: every setting has been pushed to the
   board, and the firmware is now watching the trigger pin. The monitor shows an
   amber *Armed — waiting for external trigger* banner.
4. On the next rising edge, the board starts itself. The two-photon frame trigger
   output fires, acquisition begins, and the session moves to **running**.

Pin assignment must happen **before** arming — the pin path requires a connected
session, so the pin selector is read-only once armed.

**Arming is per-run.** The board disarms itself the moment the trigger fires and
detaches the interrupt, so the pin stays inert for the rest of the session and a
stray second edge cannot disturb a run in progress. There is no auto-re-arm: to
run another externally-triggered session, arm again explicitly. Back-to-back
triggered runs therefore need an arm step between each one.

### While armed

**Settings are frozen**, and enforced on both sides: the configuration and
program panels disable their controls, and the backend rejects device commands
with HTTP 409 while armed. This is deliberate. Configuration is applied one
command per request, not as a transaction, so a trigger landing partway through
an edit would start a run with a half-applied config — an unrecoverable
data-quality problem in a live experiment. To change something, cancel, edit,
and re-arm.

Two escape hatches sit in the monitor banner:

- **Start Now** — starts immediately without waiting, identical to a normal
  software start. Use it when the trigger cable is dead and an animal is waiting.
- **Cancel** — disarms and returns the session to **connected** so settings
  unlock again.

Closing the tab or quitting the CLI while armed prompts for confirmation: the
board would still start itself on the next edge, with nothing listening.

### From the CLI

**Program → Start on External Trigger** arms; while armed the same menu offers
**Start Now (skip trigger)** and **Cancel Arm**. The entry is hidden on firmware
without trigger support.

## Timing and what the timestamps mean

**Timestamps inside the exported data are unaffected by this feature.** Every
device timestamp is emitted relative to the firmware's own session start, which
is set at the trigger edge itself. Alignment between behavior, frames, and the
trigger is therefore exact regardless of anything happening on the host.

What *does* shift is the host's wall-clock anchor. On a software start the host
sets its anchor as it sends the start command; on an external start the board
starts first and the host learns about it one serial line later. The host
back-dates the anchor to when it read that line, leaving only UART transit —
roughly 10 ms at 115200 baud. Consequences:

- A **Time** limit runs long by approximately that margin.
- `event_log.jsonl` carries two records for a single start: a behavioral
  `START` event and a `SESSION_START` record with the wall-clock anchor. This is
  true of software starts too, but on an external start the gap between them *is*
  the serial latency. The `"source": "external"` field on the START event marks
  which kind of start produced it.

---

# Hardware acceptance checklist

The trigger path cannot be exercised without hardware, so these are the
acceptance checks that must be run against a real board. Same intent as
[multi-host-validation.md](multi-host-validation.md).

**Setup:** a Mega 2560 with trigger-capable firmware, a function generator or any
5 V TTL pulse source on pin 18 with a shared ground, and — for the two-photon
checks — an oscilloscope on pin 9.

## AC-1 — The feature is discovered, not assumed

1. Connect a Mega running full firmware. ✅ **Pass:** Configuration shows an
   **External Trigger** card, and the start dialog shows **Start Mode**.
2. Upload a `_lite` build to an UNO and connect it. ✅ **Pass:** both the
   two-photon section and the external-trigger section are absent, with no error.

## AC-2 — A TTL edge starts the session

1. Configure any paradigm, choose **Wait for external trigger**, press **Arm for
   Trigger**. ✅ **Pass:** state shows *armed*, the amber banner appears, and no
   events accumulate.
2. Wait at least 60 s to confirm the board does not self-start. ✅ **Pass:** still
   armed, still no events. (This also confirms the watchdog is being serviced
   while armed — an unfed watchdog resets the board within 8 s.)
3. Send a single rising edge. ✅ **Pass:** state flips to *running* and the elapsed
   clock starts from zero at the edge, not from when you armed.

## AC-3 — Two-photon output fires on the external start, and only then

1. Arm with the microscope armed and the scope on pin 9.
2. ✅ **Pass:** **no** pulse on pin 9 while armed.
3. Send the trigger. ✅ **Pass:** exactly **one** 50 ms pulse on pin 9 at the edge.
   A second pulse would toggle the scope back off — if you see two, the host is
   also sending a start command and that is a bug.
4. ✅ **Pass:** frame timestamps accumulate normally afterwards.

## AC-4 — The board disarms itself on fire

1. Complete an externally-started run and stop it.
2. Send another edge on the trigger pin. ✅ **Pass:** nothing starts.
3. ✅ **Pass:** the Program menu / start dialog offers arming again, and a second
   arm + edge starts a fresh run with the elapsed clock at zero.

## AC-5 — The trigger event survives

1. Complete an externally-started run and export.
2. ✅ **Pass:** the export contains a `CONTROLLER` / `START` event carrying
   `"source": "external"`, and the behavioral record is not missing its first
   events.

## AC-6 — An externally-started session is configured identically

1. Run a paradigm with a distinctive config (non-default ratio, both pumps armed,
   a lever filter) started by the button. Export.
2. Repeat with the identical config started by the trigger. Export.
3. ✅ **Pass:** the two configuration dumps match field for field.

## AC-7 — Escape hatches

1. Arm, then press **Start Now** with no trigger connected. ✅ **Pass:** session
   runs; exactly one pulse on pin 9.
2. Arm, then press **Cancel**. ✅ **Pass:** state returns to *connected*, settings
   unlock, and a subsequent edge on the trigger pin does **not** start anything.
3. Cancel, change a setting, re-arm, then trigger. ✅ **Pass:** the run reflects
   the changed setting.

## AC-8 — Settings are frozen while armed

1. Arm, then attempt to change a device parameter and a pin. ✅ **Pass:** both are
   rejected or read-only; nothing reaches the board.

## AC-9 — Pin reassignment

1. While connected, move the trigger to pin 20. Arm. Pulse pin 18. ✅ **Pass:**
   nothing happens.
2. Pulse pin 20. ✅ **Pass:** the session starts.
3. ✅ **Pass:** pins 2 and 3 are not offered in the trigger pin selector.

## AC-10 — Frame timestamping is intact after a trigger run

1. Run an externally-started session with the microscope armed for ≥60 s.
2. ✅ **Pass:** frame count is consistent with the scope's frame rate — confirming
   the trigger interrupt did not displace the frame-timestamp interrupt.

## AC-11 — The software path is unchanged

1. On the same firmware build, run a session started the normal way.
2. ✅ **Pass:** behaves exactly as before — one pulse on pin 9, normal timestamps,
   no *armed* state anywhere in the flow.
