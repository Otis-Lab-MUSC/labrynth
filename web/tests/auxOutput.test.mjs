// Run: node --test tests/   (Node >= 22.18 strips the TypeScript types itself)
import test from "node:test";
import assert from "node:assert/strict";
import {
  auxCommandsFor, confirmAuxAction, AUX_CONFIRM, AUX_MODE_HELP, SHOCK_LABEL,
  blockSummary, auxStatusText, isAuxConfigured,
  isValidDuration, isValidOnsetDelay, isValidProbability, isValidBlockN, isValidBlockK, isValidSeed, isValidMode,
} from "../src/lib/auxOutput.ts";

const state = { duration: 0, onsetDelay: 0, mode: 0, probability: 0, blockK: 0, blockN: 0, seed: 0, testFire: false };

test("duration 1..5000 integers", () => {
  for (const v of [1, 5000, 500]) assert.ok(isValidDuration(v), String(v));
  for (const v of [0, 5001, -1, 1.5, NaN, "5", null]) assert.ok(!isValidDuration(v), String(v));
});

test("probability 0..100", () => {
  for (const v of [0, 100]) assert.ok(isValidProbability(v));
  for (const v of [-1, 101, 0.5, NaN]) assert.ok(!isValidProbability(v));
});

test("block n 1..100, k 0..n", () => {
  assert.ok(isValidBlockN(1) && isValidBlockN(100));
  assert.ok(!isValidBlockN(0) && !isValidBlockN(101));
  assert.ok(isValidBlockK(0, 10) && isValidBlockK(10, 10));
  assert.ok(!isValidBlockK(11, 10) && !isValidBlockK(-1, 10) && !isValidBlockK(1.5, 10));
});

test("onset >= 0, seed >= 0 integer, mode 0|1", () => {
  assert.ok(isValidOnsetDelay(0) && isValidOnsetDelay(250));
  assert.ok(!isValidOnsetDelay(-1) && !isValidOnsetDelay(1.2));
  assert.ok(isValidSeed(0) && isValidSeed(42));
  assert.ok(!isValidSeed(-1) && !isValidSeed(1.5) && !isValidSeed(NaN));
  assert.ok(isValidMode(0) && isValidMode(1) && !isValidMode(2));
});

test("auxCommandsFor order", () => {
  const s = { ...state, mode: 1, probability: 30, blockK: 3, blockN: 8, duration: 700, onsetDelay: 20, seed: 9, testFire: true };
  assert.deepEqual(auxCommandsFor(s), [
    [1480, 1], [1481, 30], [1483, 8], [1482, 3], [1472, 700], [1477, 20], [1484, 9], [1485, 1],
  ]);
});

test("independent mode omits block pairs while blockN is 0", () => {
  const codes = auxCommandsFor({ ...state, mode: 0, blockN: 0, blockK: 0 }).map(([c]) => c);
  assert.ok(!codes.includes(1483) && !codes.includes(1482));
  assert.deepEqual(auxCommandsFor({ ...state, mode: 0, blockN: 5, blockK: 2 }).slice(2, 4), [[1483, 5], [1482, 2]]);
});

test("block mode always sends both block pairs, even at N=0", () => {
  const cmds = auxCommandsFor({ ...state, mode: 1, blockN: 0, blockK: 0 });
  assert.deepEqual(cmds.slice(0, 4), [[1480, 1], [1481, 0], [1483, 0], [1482, 0]]);
});

test("auxCommandsFor never emits arm/disarm/test", () => {
  for (const testFire of [true, false]) {
    for (const mode of [0, 1]) {
      const codes = auxCommandsFor({ ...state, testFire, mode }).map(([c]) => c);
      for (const bad of [1400, 1401, 1403]) assert.ok(!codes.includes(bad));
    }
  }
});

test("1485 reflects testFire exactly", () => {
  const get = (testFire) => auxCommandsFor({ ...state, testFire }).find(([c]) => c === 1485);
  assert.deepEqual(get(false), [1485, 0]);
  assert.deepEqual(get(true), [1485, 1]);
});

test("confirmAuxAction returns false when declined and passes the right text", () => {
  for (const action of ["arm", "test", "testFire"]) {
    const seen = [];
    const ok = confirmAuxAction(action, (m) => { seen.push(m); return false; });
    assert.equal(ok, false);
    assert.deepEqual(seen, [AUX_CONFIRM[action]]);
    assert.match(AUX_CONFIRM[action], /shock/i);
    assert.match(AUX_CONFIRM[action], /animal/i);
  }
  assert.equal(confirmAuxAction("arm", () => true), true);
});

test("blockSummary", () => {
  assert.equal(blockSummary(2, 5), "2 of every 5 rewards shocked");
  assert.equal(blockSummary(0, 1), "0 of every 1 rewards shocked");
  assert.equal(blockSummary(0, 0), "Set N and K");
  assert.equal(blockSummary(3, 0), "Set N and K");
});

test("auxStatusText", () => {
  assert.equal(auxStatusText(true), "ARMED: will shock");
  assert.equal(auxStatusText(false), "Disarmed: no shock");
});

test("isAuxConfigured needs a valid duration and, in block mode, a valid N", () => {
  assert.equal(isAuxConfigured({ duration: 0, mode: 0, blockN: 0 }), false);
  assert.equal(isAuxConfigured({ duration: 500, mode: 0, blockN: 0 }), true);
  assert.equal(isAuxConfigured({ duration: 500, mode: 1, blockN: 0 }), false);
  assert.equal(isAuxConfigured({ duration: 500, mode: 1, blockN: 5 }), true);
  assert.equal(isAuxConfigured({ duration: 5001, mode: 0, blockN: 5 }), false);
});

test("AUX_MODE_HELP and SHOCK_LABEL", () => {
  assert.equal(AUX_MODE_HELP[0], "Independent: each reward is shocked with probability P.");
  assert.equal(AUX_MODE_HELP[1], "Block: exactly K shocks in every N rewards, at random positions.");
  assert.equal(SHOCK_LABEL, "Shock Output");
});
