// Run: node --test tests/   (Node >= 22.18 strips the TypeScript types itself)
import test from "node:test";
import assert from "node:assert/strict";
import { auxParts, DEVICE_LABELS } from "../src/components/monitor/hardwareSummary.ts";
import { SHOCK_LABEL } from "../src/lib/auxOutput.ts";

const base = { armed: false, duration: 500, onsetDelay: 0, mode: 0, probability: 25, blockK: 0, blockN: 0, seed: 0, testFire: false, configSent: true };

test("aux row label is the shock label", () => {
  assert.equal(DEVICE_LABELS.aux, SHOCK_LABEL);
  assert.equal(SHOCK_LABEL, "Shock Output");
});

test("independent settings are spelled out", () => {
  assert.deepEqual(auxParts(base), ["Duration:500ms", "Onset:0ms", "P:25%", "Seed:auto"]);
});

test("armed and disarmed produce the same settings text", () => {
  assert.deepEqual(auxParts({ ...base, armed: true }), auxParts(base));
});

test("unset duration", () => {
  assert.equal(auxParts({ ...base, duration: 0 })[0], "Duration: not set");
});

test("block mode shows K of every N", () => {
  assert.deepEqual(auxParts({ ...base, mode: 1, blockK: 2, blockN: 5, seed: 7, testFire: true }),
    ["Duration:500ms", "Onset:0ms", "Block: 2 of every 5", "Seed:7", "Test-fire ON"]);
});

test("block mode with N unset", () => {
  assert.equal(auxParts({ ...base, mode: 1, blockN: 0 })[2], "Block: N not set");
});

test("onset is always shown, even when zero", () => {
  assert.ok(auxParts({ ...base, onsetDelay: 0 }).includes("Onset:0ms"));
  assert.ok(auxParts({ ...base, onsetDelay: 40 }).includes("Onset:40ms"));
});
