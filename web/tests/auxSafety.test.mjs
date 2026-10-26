// Run (from web/): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { auxStateFromEvent } from "../src/lib/auxEvents.ts";

const base = {
  armed: true, duration: 500, onsetDelay: 0, mode: 0, probability: 50, blockK: 0, blockN: 0,
  seed: 0, testFire: false, configSent: true,
};

test("level-001 armed/disarmed line sets armed", () => {
  const off = auxStateFromEvent(base, { kind: "config", data: { device: "AUX", armed: false } });
  assert.equal(off.armed, false);
  const on = auxStateFromEvent(off, { kind: "config", data: { device: "AUX", armed: true } });
  assert.equal(on.armed, true);
});

test("non-AUX config is ignored", () => {
  const s = auxStateFromEvent(base, { kind: "config", data: { device: "LASER", armed: false } });
  assert.equal(s, base);
});

test("AUX_UNCONFIGURED: 1401 disarms, 1403 leaves armed; both clear configSent", () => {
  const e = (command) => ({ kind: "error", data: { device: "AUX", error_code: "AUX_UNCONFIGURED", command } });
  const arm = auxStateFromEvent(base, e(1401));
  assert.equal(arm.armed, false);
  assert.equal(arm.configSent, false);
  assert.equal(arm.lastError, "Shock refused: board not configured. Press SET.");
  const test_ = auxStateFromEvent(base, e(1403));
  assert.equal(test_.armed, true);
  assert.equal(test_.configSent, false);
  assert.ok(test_.lastError);
});

test("AUX_PIN_CONFLICT sets lastError only", () => {
  const s = auxStateFromEvent(base, { kind: "error", data: { device: "AUX", error_code: "AUX_PIN_CONFLICT", pin: 22 } });
  assert.equal(s.lastError, "Pin 22 is used by another device");
  assert.equal(s.armed, true);
  assert.equal(s.configSent, true);
});

test("echo mismatch clears configSent, matching echo keeps it", () => {
  const same = auxStateFromEvent(base, { kind: "config", data: { device: "AUX", duration: 500, probability: 50 } });
  assert.equal(same.configSent, true);
  const diff = auxStateFromEvent(base, { kind: "config", data: { device: "AUX", duration: 0 } });
  assert.equal(diff.configSent, false);
});

test("disconnect, reconnected and identification drop armed and configSent", () => {
  for (const ev of [
    { kind: "disconnect" },
    { kind: "reconnected" },
    { kind: "config", data: { device: "CONTROLLER", sketch: "reacher", version: "3" } },
  ]) {
    const s = auxStateFromEvent(base, ev);
    assert.equal(s.armed, false);
    assert.equal(s.configSent, false);
  }
});
