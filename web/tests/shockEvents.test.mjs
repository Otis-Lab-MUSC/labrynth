// Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { countShocks, shouldJolt, SHOCK_ANIM_MS } from "../src/lib/shockEvents.ts";

test("countShocks counts AUX_1 SHOCK only", () => {
  const events = [
    { device: "AUX_1", event: "SHOCK" },
    { device: "AUX_1", event: "SHOCK_OMITTED" },
    { device: "AUX_1", event: "SHOCK_SUPPRESSED" },
    { device: "LICK", event: "SHOCK" },
    { device: "AUX_1", event: "SHOCK" },
  ];
  assert.equal(countShocks(events), 2);
});

test("countShocks of an empty array is zero", () => {
  assert.equal(countShocks([]), 0);
});

test("shouldJolt fires only on a small increase while running", () => {
  assert.equal(shouldJolt(0, 1, true), true);
  assert.equal(shouldJolt(3, 5, true), true);
  assert.equal(shouldJolt(0, 3, true), false);
  assert.equal(shouldJolt(0, 1, false), false);
  assert.equal(shouldJolt(2, 2, true), false);
  assert.equal(shouldJolt(5, 0, true), false);
});

test("shock animation window is long enough for the dramatic pose", () => {
  assert.equal(SHOCK_ANIM_MS, 900);
});
