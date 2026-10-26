// Known-bug test: a page reload must not drop what the user typed or configured.
// Run (from web/): node --test tests/*.test.mjs   (Node >= 22.18 strips the TypeScript types itself; no framework)
import test from "node:test";
import assert from "node:assert/strict";
import { toStoredSession, restoredFields } from "../src/lib/sessionRecovery.ts";

const session = {
  id: "abc", port: "SIM1", paradigm: "fr", machineId: "m1", draft: false,
  name: "mouse 7 day 3",
  notes: "lever stuck briefly at 10 min",
  paradigmSettings: { ratio: 3, step: 1, interval: 30000, activeLever: "rh" },
  limitSettings: { limitType: "Infusion", timeLimit: 0, infusionLimit: 20, delay: 0, countedPumps: ["PUMP_1"] },
};

// Same path the app takes: persist -> JSON in localStorage -> reload -> restore.
const reload = (s) => restoredFields(JSON.parse(JSON.stringify([toStoredSession(s)]))[0]);

test("reload keeps the session name", () => {
  assert.equal(reload(session).name, session.name);
});

test("reload keeps the session notes", () => {
  assert.equal(reload(session).notes, session.notes);
});

test("reload keeps limit settings", () => {
  assert.deepEqual(reload(session).limitSettings, session.limitSettings);
});

test("reload keeps paradigm settings (already worked)", () => {
  assert.deepEqual(reload(session).paradigmSettings, session.paradigmSettings);
});

test("a legacy entry with no saved fields restores to empty defaults", () => {
  const legacy = { sessionId: "old", port: "COM3", paradigm: "fr" };
  assert.deepEqual(restoredFields(legacy), { name: "", notes: "", paradigmSettings: null, limitSettings: null });
});
