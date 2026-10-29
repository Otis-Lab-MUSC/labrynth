// Run (from web/): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { getDevicesNeedingSettings, isValidFrequency, isValidDuration } from "../src/lib/hardwareReadiness.ts";

const contingency = { leverFilter: "none", delay: 0 };
const blankHardware = () => ({
  rhLever: { armed: false, timeout: 0, timeoutMode: 0 },
  lhLever: { armed: false, timeout: 0, timeoutMode: 0 },
  primaryCue: { armed: false, frequency: 0, duration: 0, contingency },
  secondaryCue: { armed: false, frequency: 0, duration: 0, contingency },
  primaryPump: { armed: false, duration: 0, contingency, flowRateUlPerSec: null },
  secondaryPump: { armed: false, duration: 0, contingency, flowRateUlPerSec: null },
  laser: { armed: false, frequency: 0, duration: 0, mode: "contingent", phase: "reward", contingency: "any", onsetDelay: 0 },
  lickCircuit: { armed: false },
  microscope: { armed: false, frameRate: null, frameAveraging: null },
  slm: { armed: false, pin: 0, laserFrequency: null, laserDuration: null },
  aux: { armed: false, duration: 0, onsetDelay: 0, mode: 0, probability: 0, blockK: 0, blockN: 0, seed: 0, testFire: false, configSent: false, armPending: false },
  testMode: false,
});
const operant = { isPavlovian: false };

test("nothing armed: nothing blocks Start", () => {
  assert.deepEqual(getDevicesNeedingSettings(blankHardware(), operant), []);
});

test("disarmed devices with blank settings never block Start", () => {
  const hw = blankHardware();
  hw.primaryCue.frequency = 0;
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), []);
});

test("an armed cue with blank settings blocks Start and names both fields", () => {
  const hw = blankHardware();
  hw.primaryCue.armed = true;
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), [{ device: "Cue 1", fields: ["Freq (Hz)", "Dur (ms)"] }]);
});

test("an armed cue with good settings passes", () => {
  const hw = blankHardware();
  hw.primaryCue = { ...hw.primaryCue, armed: true, frequency: 4000, duration: 1000 };
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), []);
});

test("an armed pump with a 0 ms duration blocks Start", () => {
  const hw = blankHardware();
  hw.primaryPump.armed = true;
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), [{ device: "Pump 1", fields: ["Duration (ms)"] }]);
});

test("an armed lever with timeout 0 is fine: 0 means no timeout", () => {
  const hw = blankHardware();
  hw.rhLever.armed = true;
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), []);
});

test("Pavlovian skips lever and cue settings, which its cards do not show", () => {
  const hw = blankHardware();
  hw.primaryCue.armed = true;
  hw.rhLever = { ...hw.rhLever, armed: true, timeout: -1 };
  assert.deepEqual(getDevicesNeedingSettings(hw, { isPavlovian: true }), []);
});

test("an armed shock needs a duration in independent mode, and N in block mode", () => {
  const hw = blankHardware();
  hw.aux.armed = true;
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), [{ device: "Shock Output", fields: ["Duration (ms)"] }]);
  hw.aux = { ...hw.aux, mode: 1, duration: 500 };
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), [{ device: "Shock Output", fields: ["Rewards per block (N)"] }]);
});

test("an armed shock whose arm never reached the board blocks Start until synced", () => {
  const hw = blankHardware();
  hw.aux = { ...hw.aux, armed: true, armPending: true, duration: 500, probability: 50 };
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), [{ device: "Shock Output", fields: [], isUnsynced: true }]);
  hw.aux.armPending = false;
  assert.deepEqual(getDevicesNeedingSettings(hw, operant), []);
});

test("frequency and duration bounds", () => {
  assert.equal(isValidFrequency(null), false);
  assert.equal(isValidFrequency(0), false);
  assert.equal(isValidFrequency(65535), true);
  assert.equal(isValidFrequency(65536), false);
  assert.equal(isValidDuration(1), true);
  assert.equal(isValidDuration(600001), false);
});
