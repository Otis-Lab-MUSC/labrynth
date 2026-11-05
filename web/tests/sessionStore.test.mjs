// Drives useSessionStore actions directly. Run (from web/): npm test
import { test, beforeEach, afterEach, vi } from "vitest";
import assert from "node:assert/strict";
import { useSessionStore } from "../src/store/useSessionStore.ts";

const T0 = 1_000_000;
const ev = (device, event, extra = {}) => ({ device, event, start_timestamp: 0, end_timestamp: 0, ...extra });
const store = () => useSessionStore.getState();
const sess = (id) => store().sessions.get(id);

const ZERO = { active: 0, timeout: 0, inactive: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  useSessionStore.setState({ sessions: new Map(), activeSessionId: null, sessionOrder: [], uploadProgress: new Map() });
});
afterEach(() => vi.useRealTimers());

const draft = () => store().createDraft("m1");

test("createDraft makes an idle draft, activates it, and is reused per machine", () => {
  const id = draft();
  assert.ok(id.startsWith("draft-"));
  assert.equal(sess(id).draft, true);
  assert.equal(sess(id).state, "idle");
  assert.equal(store().activeSessionId, id);
  assert.deepEqual(store().sessionOrder, [id]);
  assert.equal(draft(), id);
  assert.notEqual(store().createDraft("m2"), id);
  assert.equal(store().sessionOrder.length, 2);
});

test("updateState walks running -> paused -> running -> stopped", () => {
  const id = draft();
  store().updateState(id, "running");
  assert.equal(sess(id).programStartTime, T0);
  assert.equal(sess(id).pauseStartTime, null);

  vi.setSystemTime(T0 + 1000);
  store().updateState(id, "paused");
  assert.equal(sess(id).pauseStartTime, T0 + 1000);

  vi.setSystemTime(T0 + 4000);
  store().updateState(id, "running");
  assert.equal(sess(id).pausedTime, 3000);
  assert.equal(sess(id).pauseStartTime, null);
  assert.equal(sess(id).programStartTime, T0);

  vi.setSystemTime(T0 + 5000);
  store().updateState(id, "stopped");
  assert.equal(sess(id).programEndTime, T0 + 5000);
  vi.setSystemTime(T0 + 9000);
  store().updateState(id, "stopped");
  assert.equal(sess(id).programEndTime, T0 + 5000);
});

test("updateState keeps firmwareCommands only in live states", () => {
  const id = draft();
  store().setFirmwareCommands(id, [{ code: 1 }]);
  store().updateState(id, "running");
  assert.equal(sess(id).firmwareCommands.length, 1);
  store().updateState(id, "uploading");
  assert.equal(sess(id).firmwareCommands, null);
});

test("a fresh start clears data and cumulatives", () => {
  const id = draft();
  store().updateState(id, "running");
  store().pushEvent(id, ev("PUMP", "INFUSION"));
  store().handleSplit(id, 1);
  store().pushFrame(id, 5);
  store().updateState(id, "idle");
  store().resetSessionData(id);
  store().updateState(id, "running");
  assert.equal(sess(id).segmentNumber, 0);
  assert.equal(sess(id).cumulativeInfusionCount, 0);

  // programStartTime already set: no reset on a second "running"
  store().pushEvent(id, ev("PUMP", "INFUSION"));
  store().updateState(id, "running");
  assert.equal(sess(id).infusionCount, 1);
});

test("isNewStart wipes live and cumulative fields", () => {
  const id = draft();
  useSessionStore.setState((s) => {
    const next = new Map(s.sessions);
    next.set(id, {
      ...next.get(id),
      behaviorData: [ev("PUMP", "INFUSION")], frameData: [1], slmData: [1],
      infusionCount: 3, serverInfusionCount: 3, infusionsByPump: { PUMP: 3 },
      pressCount: 2, trialCount: 2, csPlusCount: 1, csMinusCount: 1,
      rhLeverCounts: { active: 1, timeout: 1, inactive: 1 }, lhLeverCounts: { active: 1, timeout: 1, inactive: 1 },
      segmentNumber: 2, cumulativeInfusionCount: 4, cumulativePressCount: 4, cumulativeTrialCount: 4,
      cumulativeCsPlusCount: 4, cumulativeCsMinusCount: 4, cumulativeShockCount: 4,
      cumulativeRhLeverCounts: { active: 1, timeout: 1, inactive: 1 }, cumulativeLhLeverCounts: { active: 1, timeout: 1, inactive: 1 },
      cumulativeElapsedTime: 99, pausedTime: 5, pauseStartTime: 7, programEndTime: 8,
    });
    return { sessions: next };
  });
  store().updateState(id, "running");
  const s = sess(id);
  assert.deepEqual(s.behaviorData, []);
  assert.deepEqual(s.frameData, []);
  assert.deepEqual(s.slmData, []);
  assert.equal(s.infusionCount, 0);
  assert.equal(s.serverInfusionCount, null);
  assert.equal(s.infusionsByPump, null);
  assert.equal(s.segmentNumber, 0);
  assert.equal(s.cumulativeInfusionCount, 0);
  assert.equal(s.cumulativeShockCount, 0);
  assert.equal(s.cumulativeElapsedTime, 0);
  assert.deepEqual(s.cumulativeRhLeverCounts, ZERO);
  assert.deepEqual(s.cumulativeLhLeverCounts, ZERO);
  assert.deepEqual(s.rhLeverCounts, ZERO);
  assert.equal(s.pausedTime, 0);
  assert.equal(s.pauseStartTime, null);
  assert.equal(s.programEndTime, null);
  assert.equal(s.programStartTime, T0);
});

test("pushEvent is ignored while idle and counts while running or paused", () => {
  const id = draft();
  store().pushEvent(id, ev("PUMP", "INFUSION"));
  assert.deepEqual(sess(id).behaviorData, []);
  assert.equal(sess(id).infusionCount, 0);

  store().updateState(id, "running");
  store().pushEvent(id, ev("PUMP_1", "INFUSION"));
  store().updateState(id, "paused");
  store().pushEvent(id, ev("PUMP_2", "INFUSION"));
  assert.equal(sess(id).infusionCount, 2);
  assert.equal(sess(id).behaviorData.length, 2);
});

test("pushEvent counts presses, trials, CS and lever buckets; ignores non-pump INFUSION", () => {
  const id = draft();
  store().updateState(id, "running");
  const push = (e) => store().pushEvent(id, e);
  push(ev("RH_LEVER", "ACTIVE_PRESS"));
  push(ev("LEVER_RH", "TIMEOUT_PRESS"));
  push(ev("LH_LEVER", "INACTIVE_PRESS"));
  push(ev("LEVER_LH", "ACTIVE_PRESS"));
  push(ev("RH_LEVER", "RELEASE"));
  push(ev("AUX_1", "INFUSION"));
  push(ev("PAVLOV", "TRIAL_START", { trial_type: "CS_PLUS" }));
  push(ev("PAVLOV", "TRIAL_START", { trial_type: "CS_MINUS" }));
  push(ev("PAVLOV", "TRIAL_START"));
  push(ev("PAVLOV", "TRIAL_END", { trial_type: "CS_PLUS" }));
  const s = sess(id);
  assert.equal(s.pressCount, 4);
  assert.equal(s.infusionCount, 0);
  assert.equal(s.trialCount, 3);
  assert.equal(s.csPlusCount, 1);
  assert.equal(s.csMinusCount, 1);
  assert.deepEqual(s.rhLeverCounts, { active: 1, timeout: 1, inactive: 0 });
  assert.deepEqual(s.lhLeverCounts, { active: 1, timeout: 0, inactive: 1 });
  assert.equal(s.behaviorData.length, 10);
});

test("replaceEvents recomputes every counter and works in any state", () => {
  const id = draft();
  const events = [
    ev("PUMP", "INFUSION"), ev("PUMP_2", "INFUSION"), ev("AUX_1", "INFUSION"),
    ev("RH_LEVER", "ACTIVE_PRESS"), ev("LEVER_LH", "TIMEOUT_PRESS"), ev("LH_LEVER", "INACTIVE_PRESS"),
    ev("PAVLOV", "TRIAL_START", { trial_type: "CS_PLUS" }), ev("PAVLOV", "TRIAL_START", { trial_type: "CS_MINUS" }),
  ];
  store().replaceEvents(id, events);
  const s = sess(id);
  assert.equal(s.behaviorData, events);
  assert.equal(s.infusionCount, 2);
  assert.equal(s.pressCount, 3);
  assert.equal(s.trialCount, 2);
  assert.equal(s.csPlusCount, 1);
  assert.equal(s.csMinusCount, 1);
  assert.deepEqual(s.rhLeverCounts, { active: 1, timeout: 0, inactive: 0 });
  assert.deepEqual(s.lhLeverCounts, { active: 0, timeout: 1, inactive: 1 });

  // replace == fold of push
  const id2 = store().createDraft("m2");
  store().updateState(id2, "running");
  for (const e of events) store().pushEvent(id2, e);
  for (const k of ["infusionCount", "pressCount", "trialCount", "csPlusCount", "csMinusCount", "rhLeverCounts", "lhLeverCounts"]) {
    assert.deepEqual(sess(id2)[k], s[k], k);
  }
});

test("handleSplit folds counts and elapsed time into cumulatives and restarts the segment", () => {
  const id = draft();
  store().updateState(id, "running");
  store().pushEvent(id, ev("PUMP", "INFUSION"));
  store().pushEvent(id, ev("RH_LEVER", "ACTIVE_PRESS"));
  store().pushEvent(id, ev("AUX_1", "SHOCK"));
  store().pushEvent(id, ev("PAVLOV", "TRIAL_START", { trial_type: "CS_PLUS" }));
  store().setExportState(id, { result: "x" });
  vi.setSystemTime(T0 + 10_000);
  store().handleSplit(id, 1);
  const s = sess(id);
  assert.equal(s.segmentNumber, 1);
  assert.equal(s.cumulativeInfusionCount, 1);
  assert.equal(s.cumulativePressCount, 1);
  assert.equal(s.cumulativeTrialCount, 1);
  assert.equal(s.cumulativeCsPlusCount, 1);
  assert.equal(s.cumulativeShockCount, 1);
  assert.deepEqual(s.cumulativeRhLeverCounts, { active: 1, timeout: 0, inactive: 0 });
  assert.equal(s.cumulativeElapsedTime, 10_000);
  assert.deepEqual(s.behaviorData, []);
  assert.equal(s.infusionCount, 0);
  assert.deepEqual(s.rhLeverCounts, ZERO);
  assert.equal(s.programStartTime, T0 + 10_000);
  assert.equal(s.programEndTime, null);
  assert.equal(s.pausedTime, 0);
  assert.equal(s.pauseStartTime, null);
  assert.deepEqual(s.exportState, { exporting: false, result: null, error: null });
});

test("handleSplit while paused excludes paused time and keeps pausing", () => {
  const id = draft();
  store().updateState(id, "running");
  vi.setSystemTime(T0 + 2000);
  store().updateState(id, "paused");
  vi.setSystemTime(T0 + 3000);
  store().updateState(id, "running");
  vi.setSystemTime(T0 + 6000);
  store().updateState(id, "paused");
  vi.setSystemTime(T0 + 9000);
  store().handleSplit(id, 1);
  // 9000 total - 1000 earlier pause - 3000 current pause
  assert.equal(sess(id).cumulativeElapsedTime, 5000);
  assert.equal(sess(id).pauseStartTime, T0 + 9000);
  assert.equal(sess(id).programStartTime, T0 + 9000);
});

test("handleSplit before a start adds no elapsed time", () => {
  const id = draft();
  store().handleSplit(id, 1);
  assert.equal(sess(id).cumulativeElapsedTime, 0);
});

test("handleRestart returns to a clean running session", () => {
  const id = draft();
  store().updateState(id, "running");
  store().pushEvent(id, ev("PUMP", "INFUSION"));
  store().handleSplit(id, 1);
  store().setSessionName(id, "keep");
  store().setExportState(id, { error: "e" });
  vi.setSystemTime(T0 + 500);
  store().handleRestart(id);
  const s = sess(id);
  assert.equal(s.state, "running");
  assert.equal(s.name, "keep");
  assert.equal(s.segmentNumber, 0);
  assert.equal(s.cumulativeInfusionCount, 0);
  assert.equal(s.cumulativeElapsedTime, 0);
  assert.equal(s.infusionCount, 0);
  assert.equal(s.programStartTime, T0 + 500);
  assert.equal(s.programEndTime, null);
  assert.equal(s.pausedTime, 0);
  assert.equal(s.pauseStartTime, null);
  assert.deepEqual(s.exportState, { exporting: false, result: null, error: null });
});

const dirty = (id) =>
  useSessionStore.setState((st) => {
    const next = new Map(st.sessions);
    next.set(id, {
      ...next.get(id),
      name: "n", notes: "keep notes", behaviorData: [ev("PUMP", "INFUSION")], frameData: [1], slmData: [1],
      infusionCount: 1, serverInfusionCount: 1, infusionsByPump: { PUMP: 1 }, pressCount: 1, trialCount: 1,
      csPlusCount: 1, csMinusCount: 1, rhLeverCounts: { active: 1, timeout: 0, inactive: 0 },
      lhLeverCounts: { active: 1, timeout: 0, inactive: 0 },
      programStartTime: 1, programEndTime: 2, pausedTime: 3, pauseStartTime: 4,
      pavlovianParams: { 1: 1 }, paradigmSettings: { ratio: 1, step: 1, interval: 1 },
      limitSettings: { limitType: "Time", timeLimit: 1, infusionLimit: 0, delay: 0 },
      hardwareSettings: [{ device: "PUMP" }], hardwareUi: { ...next.get(id).hardwareUi, testMode: true },
      exportState: { exporting: true, result: "r", error: "e" },
      segmentNumber: 3, cumulativeInfusionCount: 5, cumulativeElapsedTime: 6, cumulativeShockCount: 7,
      pinOverrides: { pump: 4 }, fileConfig: { filename: "f", destination: "d" }, port: "P", paradigm: "fr",
    });
    return { sessions: next };
  });

test("resetSessionData clears data, name, params, settings and hardware UI only", () => {
  const id = draft();
  dirty(id);
  const before = sess(id);
  store().resetSessionData(id);
  const s = sess(id);
  assert.equal(s.name, "");
  assert.deepEqual(s.behaviorData, []);
  assert.deepEqual(s.frameData, []);
  assert.deepEqual(s.slmData, []);
  assert.equal(s.infusionCount, 0);
  assert.equal(s.serverInfusionCount, null);
  assert.equal(s.infusionsByPump, null);
  assert.equal(s.pressCount, 0);
  assert.equal(s.trialCount, 0);
  assert.equal(s.csPlusCount, 0);
  assert.equal(s.csMinusCount, 0);
  assert.deepEqual(s.rhLeverCounts, ZERO);
  assert.deepEqual(s.lhLeverCounts, ZERO);
  assert.equal(s.programStartTime, null);
  assert.equal(s.programEndTime, null);
  assert.equal(s.pausedTime, 0);
  assert.equal(s.pauseStartTime, null);
  assert.equal(s.pavlovianParams, null);
  assert.equal(s.paradigmSettings, null);
  assert.equal(s.limitSettings, null);
  assert.deepEqual(s.hardwareSettings, []);
  assert.equal(s.hardwareUi.testMode, false);
  assert.deepEqual(s.exportState, { exporting: false, result: null, error: null });
  // untouched
  for (const k of ["notes", "segmentNumber", "cumulativeInfusionCount", "cumulativeElapsedTime", "cumulativeShockCount", "pinOverrides", "fileConfig", "port", "paradigm", "state", "id"]) {
    assert.deepEqual(s[k], before[k], k);
  }
});

test("softResetSessionData keeps name, params, settings and hardware UI", () => {
  const id = draft();
  dirty(id);
  const before = sess(id);
  store().softResetSessionData(id);
  const s = sess(id);
  assert.deepEqual(s.behaviorData, []);
  assert.equal(s.infusionCount, 0);
  assert.equal(s.serverInfusionCount, null);
  assert.equal(s.infusionsByPump, null);
  assert.equal(s.pressCount, 0);
  assert.equal(s.programStartTime, null);
  assert.equal(s.programEndTime, null);
  assert.equal(s.pausedTime, 0);
  assert.equal(s.pauseStartTime, null);
  assert.deepEqual(s.hardwareSettings, []);
  assert.deepEqual(s.rhLeverCounts, ZERO);
  assert.deepEqual(s.exportState, { exporting: false, result: null, error: null });
  for (const k of ["name", "notes", "pavlovianParams", "paradigmSettings", "limitSettings", "hardwareUi", "segmentNumber", "cumulativeInfusionCount", "cumulativeElapsedTime", "cumulativeShockCount", "pinOverrides", "fileConfig"]) {
    assert.deepEqual(s[k], before[k], k);
  }
});

test("pushHardwareSetting merges param/value ACKs and replaces whole rows", () => {
  const id = draft();
  store().pushHardwareSetting(id, { device: "PUMP", armed: true, ratio: 3 });
  store().pushHardwareSetting(id, { device: "LASER", armed: false });
  store().pushHardwareSetting(id, { device: "PUMP", param: "ratio", value: 5 });
  assert.deepEqual(sess(id).hardwareSettings, [
    { device: "PUMP", armed: true, ratio: 5 },
    { device: "LASER", armed: false },
  ]);
  store().pushHardwareSetting(id, { device: "PUMP", sketch: "s", param: "ratio", value: 9 });
  assert.deepEqual(sess(id).hardwareSettings[0], { device: "PUMP", sketch: "s", param: "ratio", value: 9 });
  store().pushHardwareSetting(id, { device: "PUMP", duration: 2 });
  assert.deepEqual(sess(id).hardwareSettings[0], { device: "PUMP", duration: 2 });
  assert.equal(sess(id).hardwareSettings.length, 2);
});

test("reorderSession moves a tab before the target and ignores bad ids", () => {
  const a = store().createDraft("a");
  const b = store().createDraft("b");
  const c = store().createDraft("c");
  store().reorderSession(c, a);
  assert.deepEqual(store().sessionOrder, [c, a, b]);
  store().reorderSession(a, a);
  store().reorderSession(a, "missing");
  assert.deepEqual(store().sessionOrder, [c, a, b]);
});

test("destroySession of a draft removes it and moves the active tab", async () => {
  const a = store().createDraft("a");
  const b = store().createDraft("b");
  store().setUploadProgress(b, 50, "x");
  assert.equal(store().activeSessionId, b);
  await store().destroySession(b);
  assert.equal(sess(b), undefined);
  assert.equal(store().activeSessionId, a);
  assert.deepEqual(store().sessionOrder, [a]);
  assert.equal(store().uploadProgress.has(b), false);
  await store().destroySession(a);
  assert.equal(store().activeSessionId, null);
});

test("simple setters change only their field and unknown ids are no-ops", () => {
  const id = draft();
  store().setParadigm(id, "pr");
  assert.equal(sess(id).paradigm, "pr");
  store().setFileConfig(id, { filename: "f" });
  store().setFileConfig(id, { destination: "d" });
  assert.deepEqual(sess(id).fileConfig, { filename: "f", destination: "d" });
  store().setPinOverrides(id, { a: 1 });
  store().setPinOverrides(id, { b: 2 });
  assert.deepEqual(sess(id).pinOverrides, { a: 1, b: 2 });
  store().updateHardwareUi(id, () => ({ testMode: true }));
  assert.equal(sess(id).hardwareUi.testMode, true);
  assert.equal(sess(id).hardwareUi.laser.armed, false);
  const before = store().sessions;
  store().setBoard("nope", "uno");
  store().pushEvent("nope", ev("PUMP", "INFUSION"));
  assert.equal(store().sessions, before);
});
