import type { BehaviorEvent, LeverCounts, Session } from "../types";
import type { EventDevice } from "../generated/deviceNames";

const PUMP_DEVICES: ReadonlySet<string> = new Set<EventDevice>(["PUMP", "PUMP_1", "PUMP_2"]);
// The RH_LEVER / LH_LEVER spellings are not in EventDevice but are still counted.
const RH_LEVER_DEVICES: ReadonlySet<string> = new Set<string>(["RH_LEVER", "LEVER_RH" satisfies EventDevice]);
const LH_LEVER_DEVICES: ReadonlySet<string> = new Set<string>(["LH_LEVER", "LEVER_LH" satisfies EventDevice]);
const PAVLOV_DEVICE: EventDevice = "PAVLOV";

const INFUSION_EVENT = "INFUSION";
const PRESS_EVENT_FRAGMENT = "PRESS";
const ACTIVE_PRESS_EVENT = "ACTIVE_PRESS";
const TIMEOUT_PRESS_EVENT = "TIMEOUT_PRESS";
const INACTIVE_PRESS_EVENT = "INACTIVE_PRESS";
const TRIAL_START_EVENT = "TRIAL_START";

/** The counters a single behaviour event can move. */
export interface EventCounts {
  infusionCount: number;
  pressCount: number;
  trialCount: number;
  csPlusCount: number;
  csMinusCount: number;
  rhLeverCounts: LeverCounts;
  lhLeverCounts: LeverCounts;
}

/** The running totals carried across splits. */
export interface CumulativeCounts {
  cumulativeInfusionCount: number;
  cumulativePressCount: number;
  cumulativeTrialCount: number;
  cumulativeCsPlusCount: number;
  cumulativeCsMinusCount: number;
  cumulativeShockCount: number;
  cumulativeRhLeverCounts: LeverCounts;
  cumulativeLhLeverCounts: LeverCounts;
  cumulativeElapsedTime: number;
}

/** The pause and timing fields that change when a session's state changes. */
export interface PauseFields {
  programStartTime: number | null;
  programEndTime: number | null;
  pausedTime: number;
  pauseStartTime: number | null;
}

/** A fresh lever bucket with every count at zero. */
export function zeroLeverCounts(): LeverCounts {
  return { active: 0, timeout: 0, inactive: 0 };
}

/** Event counters all at zero. */
export function zeroEventCounts(): EventCounts {
  return {
    infusionCount: 0,
    pressCount: 0,
    trialCount: 0,
    csPlusCount: 0,
    csMinusCount: 0,
    rhLeverCounts: zeroLeverCounts(),
    lhLeverCounts: zeroLeverCounts(),
  };
}

function addLeverPress(counts: LeverCounts, eventName: string): LeverCounts {
  return {
    active: counts.active + (eventName === ACTIVE_PRESS_EVENT ? 1 : 0),
    timeout: counts.timeout + (eventName === TIMEOUT_PRESS_EVENT ? 1 : 0),
    inactive: counts.inactive + (eventName === INACTIVE_PRESS_EVENT ? 1 : 0),
  };
}

/** Counts after one more event; an untouched lever bucket keeps its identity. */
export function addEventToCounts(counts: EventCounts, event: BehaviorEvent): EventCounts {
  const isRhLever = RH_LEVER_DEVICES.has(event.device);
  const isLhLever = LH_LEVER_DEVICES.has(event.device);
  const isTrialStart = event.device === PAVLOV_DEVICE && event.event === TRIAL_START_EVENT;
  return {
    infusionCount: counts.infusionCount + (PUMP_DEVICES.has(event.device) && event.event === INFUSION_EVENT ? 1 : 0),
    pressCount: counts.pressCount + ((isRhLever || isLhLever) && event.event.includes(PRESS_EVENT_FRAGMENT) ? 1 : 0),
    trialCount: counts.trialCount + (isTrialStart ? 1 : 0),
    csPlusCount: counts.csPlusCount + (isTrialStart && event.trial_type === "CS_PLUS" ? 1 : 0),
    csMinusCount: counts.csMinusCount + (isTrialStart && event.trial_type === "CS_MINUS" ? 1 : 0),
    rhLeverCounts: isRhLever ? addLeverPress(counts.rhLeverCounts, event.event) : counts.rhLeverCounts,
    lhLeverCounts: isLhLever ? addLeverPress(counts.lhLeverCounts, event.event) : counts.lhLeverCounts,
  };
}

/** Counts for a whole event list, as if each event had been added in order. */
export function countEvents(events: readonly BehaviorEvent[]): EventCounts {
  return events.reduce(addEventToCounts, zeroEventCounts());
}

function sumLeverCounts(a: LeverCounts, b: LeverCounts): LeverCounts {
  return { active: a.active + b.active, timeout: a.timeout + b.timeout, inactive: a.inactive + b.inactive };
}

/** Wall-clock ms the current segment has run, excluding paused time. */
export function segmentElapsedMs(session: Session, now: number): number {
  if (!session.programStartTime) return 0;
  const currentPauseMs = session.state === "paused" && session.pauseStartTime ? now - session.pauseStartTime : 0;
  return now - session.programStartTime - session.pausedTime - currentPauseMs;
}

/** The session's cumulative totals with its current segment folded in. */
export function foldSegmentIntoCumulative(session: Session, shockCount: number, now: number): CumulativeCounts {
  return {
    cumulativeInfusionCount: session.cumulativeInfusionCount + session.infusionCount,
    cumulativePressCount: session.cumulativePressCount + session.pressCount,
    cumulativeTrialCount: session.cumulativeTrialCount + session.trialCount,
    cumulativeCsPlusCount: session.cumulativeCsPlusCount + session.csPlusCount,
    cumulativeCsMinusCount: session.cumulativeCsMinusCount + session.csMinusCount,
    cumulativeShockCount: session.cumulativeShockCount + shockCount,
    cumulativeRhLeverCounts: sumLeverCounts(session.cumulativeRhLeverCounts, session.rhLeverCounts),
    cumulativeLhLeverCounts: sumLeverCounts(session.cumulativeLhLeverCounts, session.lhLeverCounts),
    cumulativeElapsedTime: session.cumulativeElapsedTime + segmentElapsedMs(session, now),
  };
}

/** Timing fields after moving the session to `state`; a first start clears them. */
export function nextPauseFields(session: Session, state: Session["state"], now: number): PauseFields {
  const isNewStart = state === "running" && session.programStartTime === null;
  if (isNewStart) {
    return { programStartTime: now, programEndTime: null, pausedTime: 0, pauseStartTime: null };
  }
  const startsPause = state === "paused" && session.state !== "paused";
  const endsPause = session.state === "paused" && state !== "paused";
  const pauseDelta = endsPause && session.pauseStartTime != null ? now - session.pauseStartTime : 0;
  let pauseStartTime = session.pauseStartTime;
  if (startsPause) pauseStartTime = now;
  else if (endsPause) pauseStartTime = null;
  return {
    programStartTime: session.programStartTime,
    programEndTime: state === "stopped" && session.programEndTime === null ? now : session.programEndTime,
    pausedTime: session.pausedTime + pauseDelta,
    pauseStartTime,
  };
}
