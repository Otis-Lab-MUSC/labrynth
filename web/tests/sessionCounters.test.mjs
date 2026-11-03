// Pure counting and bookkeeping behind the session store. Run (from web/): npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  addEventToCounts, countEvents, zeroEventCounts, zeroLeverCounts,
  segmentElapsedMs, foldSegmentIntoCumulative, nextPauseFields,
} from "../src/lib/sessionCounters.ts";

const ev = (device, event, extra = {}) => ({ device, event, start_timestamp: 0, end_timestamp: 0, ...extra });
const add = (e) => addEventToCounts(zeroEventCounts(), e);

test("every pump spelling counts an INFUSION; other devices and events do not", () => {
  for (const d of ["PUMP", "PUMP_1", "PUMP_2"]) assert.equal(add(ev(d, "INFUSION")).infusionCount, 1, d);
  assert.equal(add(ev("AUX_1", "INFUSION")).infusionCount, 0);
  assert.equal(add(ev("PUMP", "START")).infusionCount, 0);
});

test("every lever spelling counts a press; the event name only needs to contain PRESS", () => {
  for (const d of ["RH_LEVER", "LH_LEVER", "LEVER_RH", "LEVER_LH"]) assert.equal(add(ev(d, "ACTIVE_PRESS")).pressCount, 1, d);
  assert.equal(add(ev("LEVER_RH", "PRESS")).pressCount, 1);
  assert.equal(add(ev("LEVER_RH", "RELEASE")).pressCount, 0);
  assert.equal(add(ev("LICK", "ACTIVE_PRESS")).pressCount, 0);
});

test("lever presses land in the right side and bucket", () => {
  const c = [
    ev("RH_LEVER", "ACTIVE_PRESS"), ev("LEVER_RH", "TIMEOUT_PRESS"), ev("LEVER_RH", "INACTIVE_PRESS"),
    ev("LH_LEVER", "ACTIVE_PRESS"), ev("LEVER_LH", "ACTIVE_PRESS"), ev("LEVER_LH", "PRESS"),
  ].reduce(addEventToCounts, zeroEventCounts());
  assert.deepEqual(c.rhLeverCounts, { active: 1, timeout: 1, inactive: 1 });
  assert.deepEqual(c.lhLeverCounts, { active: 2, timeout: 0, inactive: 0 });
  assert.equal(c.pressCount, 6);
});

test("an untouched lever bucket keeps its identity and the input is not mutated", () => {
  const start = zeroEventCounts();
  const next = addEventToCounts(start, ev("LEVER_RH", "ACTIVE_PRESS"));
  assert.equal(next.lhLeverCounts, start.lhLeverCounts);
  assert.deepEqual(start, zeroEventCounts());
});

test("trials and CS count only on PAVLOV TRIAL_START", () => {
  const c = [
    ev("PAVLOV", "TRIAL_START", { trial_type: "CS_PLUS" }),
    ev("PAVLOV", "TRIAL_START", { trial_type: "CS_MINUS" }),
    ev("PAVLOV", "TRIAL_START"),
    ev("PAVLOV", "TRIAL_END", { trial_type: "CS_PLUS" }),
    ev("CUE", "TRIAL_START", { trial_type: "CS_PLUS" }),
  ].reduce(addEventToCounts, zeroEventCounts());
  assert.equal(c.trialCount, 3);
  assert.equal(c.csPlusCount, 1);
  assert.equal(c.csMinusCount, 1);
});

test("countEvents equals folding addEventToCounts over the list", () => {
  const events = [
    ev("PUMP_2", "INFUSION"), ev("LEVER_LH", "TIMEOUT_PRESS"), ev("RH_LEVER", "ACTIVE_PRESS"),
    ev("PAVLOV", "TRIAL_START", { trial_type: "CS_MINUS" }), ev("AUX_1", "INFUSION"),
  ];
  assert.deepEqual(countEvents(events), events.reduce(addEventToCounts, zeroEventCounts()));
  assert.deepEqual(countEvents([]), zeroEventCounts());
});

const base = {
  state: "running", programStartTime: 1000, programEndTime: null, pausedTime: 0, pauseStartTime: null,
  infusionCount: 2, pressCount: 3, trialCount: 4, csPlusCount: 1, csMinusCount: 2,
  rhLeverCounts: { active: 1, timeout: 0, inactive: 2 }, lhLeverCounts: { active: 0, timeout: 3, inactive: 0 },
  cumulativeInfusionCount: 10, cumulativePressCount: 10, cumulativeTrialCount: 10,
  cumulativeCsPlusCount: 10, cumulativeCsMinusCount: 10, cumulativeShockCount: 10,
  cumulativeRhLeverCounts: { active: 10, timeout: 10, inactive: 10 },
  cumulativeLhLeverCounts: { active: 10, timeout: 10, inactive: 10 },
  cumulativeElapsedTime: 500,
};

test("segmentElapsedMs: zero before a start, minus completed and current pauses", () => {
  assert.equal(segmentElapsedMs({ ...base, programStartTime: null }, 5000), 0);
  assert.equal(segmentElapsedMs(base, 5000), 4000);
  assert.equal(segmentElapsedMs({ ...base, pausedTime: 1000 }, 5000), 3000);
  assert.equal(segmentElapsedMs({ ...base, state: "paused", pauseStartTime: 4000 }, 5000), 3000);
  assert.equal(segmentElapsedMs({ ...base, state: "running", pauseStartTime: 4000 }, 5000), 4000);
});

test("foldSegmentIntoCumulative adds the segment, the shock count and the elapsed time", () => {
  assert.deepEqual(foldSegmentIntoCumulative(base, 2, 5000), {
    cumulativeInfusionCount: 12, cumulativePressCount: 13, cumulativeTrialCount: 14,
    cumulativeCsPlusCount: 11, cumulativeCsMinusCount: 12, cumulativeShockCount: 12,
    cumulativeRhLeverCounts: { active: 11, timeout: 10, inactive: 12 },
    cumulativeLhLeverCounts: { active: 10, timeout: 13, inactive: 10 },
    cumulativeElapsedTime: 4500,
  });
});

test("foldSegmentIntoCumulative leaves out the time spent in a current pause", () => {
  const paused = { ...base, state: "paused", pausedTime: 500, pauseStartTime: 3000 };
  assert.equal(foldSegmentIntoCumulative(paused, 0, 5000).cumulativeElapsedTime, 500 + (5000 - 1000 - 500 - 2000));
});

test("nextPauseFields: first start stamps the start and clears the rest", () => {
  const idle = { ...base, state: "idle", programStartTime: null, programEndTime: 9, pausedTime: 7, pauseStartTime: 8 };
  assert.deepEqual(nextPauseFields(idle, "running", 2000),
    { programStartTime: 2000, programEndTime: null, pausedTime: 0, pauseStartTime: null });
});

test("nextPauseFields: pause then resume accumulates paused time", () => {
  const paused = nextPauseFields(base, "paused", 2000);
  assert.equal(paused.pauseStartTime, 2000);
  assert.equal(paused.pausedTime, 0);
  const resumed = nextPauseFields({ ...base, ...paused, state: "paused" }, "running", 5000);
  assert.equal(resumed.pauseStartTime, null);
  assert.equal(resumed.pausedTime, 3000);
  assert.equal(resumed.programStartTime, 1000);
});

test("nextPauseFields: stop stamps the end once; staying paused keeps the pause start", () => {
  assert.equal(nextPauseFields(base, "stopped", 7000).programEndTime, 7000);
  assert.equal(nextPauseFields({ ...base, programEndTime: 6000 }, "stopped", 7000).programEndTime, 6000);
  const paused = { ...base, state: "paused", pauseStartTime: 2000 };
  assert.equal(nextPauseFields(paused, "paused", 9000).pauseStartTime, 2000);
  assert.equal(nextPauseFields(paused, "stopped", 9000).pausedTime, 7000);
});

test("zeroLeverCounts returns a fresh object each time", () => {
  assert.notEqual(zeroLeverCounts(), zeroLeverCounts());
});
