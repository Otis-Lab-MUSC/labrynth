// Run (from web/): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { LIMIT_DEFAULTS, getMissingLimitFields, buildLimitPayload } from "../src/lib/limits.ts";
import { randomUUID } from "../src/lib/uuid.ts";

const limits = (over) => ({ limitType: "Time", ...LIMIT_DEFAULTS, countedPumps: null, ...over });

test("defaults are zero, so a fresh Time limit must be filled in", () => {
  assert.deepEqual(LIMIT_DEFAULTS, { timeLimit: 0, infusionLimit: 0, delay: 0 });
  assert.deepEqual(getMissingLimitFields(limits({})), ["Time Limit (s)"]);
});

test("Both needs a time and an infusion limit; a zero stop delay is allowed", () => {
  assert.deepEqual(getMissingLimitFields(limits({ limitType: "Both" })), ["Time Limit (s)", "Infusion Limit"]);
  assert.deepEqual(getMissingLimitFields(limits({ limitType: "Both", timeLimit: 3600, infusionLimit: 30 })), []);
});

test("Trials has nothing to fill in", () => {
  assert.deepEqual(getMissingLimitFields(limits({ limitType: "Trials" })), []);
});

test("out-of-range values are flagged", () => {
  assert.deepEqual(getMissingLimitFields(limits({ timeLimit: 86401 })), ["Time Limit (s)"]);
  assert.deepEqual(getMissingLimitFields(limits({ limitType: "Infusion", infusionLimit: 5, delay: -1 })), ["Stop Delay (s)"]);
});

test("buildLimitPayload sends only what the server can take", () => {
  assert.equal(buildLimitPayload(limits({})), null);
  assert.deepEqual(buildLimitPayload(limits({ timeLimit: 3600 })), { type: "Time", time_limit: 3600 });
  // Both with only the time filled in goes out as Time; the infusion limit upgrades it to Both.
  assert.deepEqual(buildLimitPayload(limits({ limitType: "Both", timeLimit: 3600 })), { type: "Time", time_limit: 3600 });
  assert.deepEqual(buildLimitPayload(limits({ limitType: "Both", timeLimit: 3600, infusionLimit: 30, delay: 10 })),
    { type: "Both", time_limit: 3600, infusion_limit: 30, delay: 10, counted_pumps: null });
  assert.deepEqual(buildLimitPayload(limits({ limitType: "Infusion", infusionLimit: 5, countedPumps: ["PUMP_2"] })),
    { type: "Infusion", infusion_limit: 5, delay: 0, counted_pumps: ["PUMP_2"] });
  // A time limit left over from a Time setup is not sent once the type is Infusion.
  assert.equal(buildLimitPayload(limits({ limitType: "Infusion", timeLimit: 3600 })), null);
  assert.deepEqual(buildLimitPayload(limits({ limitType: "Trials" })), { type: "Trials" });
});

test("randomUUID falls back when crypto.randomUUID is missing (plain-HTTP page)", (t) => {
  const real = globalThis.crypto.randomUUID;
  t.after(() => { globalThis.crypto.randomUUID = real; });
  globalThis.crypto.randomUUID = undefined;
  const ids = new Set(Array.from({ length: 50 }, () => randomUUID()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
