// Session limit defaults and the checks that gate their upload and Start Session.
// Erasable TS only: node --test imports this directly.

export interface LimitValues {
  limitType: string;
  timeLimit: number;
  infusionLimit: number;
  delay: number;
  countedPumps?: string[] | null;
}

/** Seeds for a session with no stored limits. Zero means "not set yet": the user must enter a limit. */
export const LIMIT_DEFAULTS = { timeLimit: 0, infusionLimit: 0, delay: 0 };

export const MAX_TIME_LIMIT_S = 86400;
export const MAX_INFUSION_LIMIT = 10000;
export const MAX_STOP_DELAY_S = 86400;

export const hasTimeLimit = (limitType: string) => limitType === "Time" || limitType === "Both";
export const hasInfusionLimit = (limitType: string) => limitType === "Infusion" || limitType === "Both";

export const isValidTimeLimit = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_TIME_LIMIT_S;
export const isValidInfusionLimit = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_INFUSION_LIMIT;
export const isValidStopDelay = (v: number) => Number.isInteger(v) && v >= 0 && v <= MAX_STOP_DELAY_S;

/**
 * Labels of the limit fields that must be fixed before the limits can be uploaded or a session
 * started, in card order. Trials has none: the firmware ends the session on its own trial count.
 */
export function getMissingLimitFields(limits: LimitValues): string[] {
  const missing: string[] = [];
  if (hasTimeLimit(limits.limitType) && !isValidTimeLimit(limits.timeLimit)) missing.push("Time Limit (s)");
  if (hasInfusionLimit(limits.limitType)) {
    if (!isValidInfusionLimit(limits.infusionLimit)) missing.push("Infusion Limit");
    if (!isValidStopDelay(limits.delay)) missing.push("Stop Delay (s)");
  }
  return missing;
}

export interface LimitPayload {
  type: string;
  time_limit?: number;
  infusion_limit?: number;
  delay?: number;
  counted_pumps?: string[] | null;
}

/**
 * The /limit request body for whatever is valid so far, or null when the server cannot take any of
 * it yet. The server rejects a type whose limits are missing, so a "Both" with only the time limit
 * filled in goes out as "Time"; once the infusion limit is sent too, it goes out as "Both".
 */
export function buildLimitPayload(limits: LimitValues): LimitPayload | null {
  const { limitType } = limits;
  if (limitType === "Trials") return { type: "Trials" };
  const time = hasTimeLimit(limitType) && isValidTimeLimit(limits.timeLimit);
  const infusion = hasInfusionLimit(limitType) && isValidInfusionLimit(limits.infusionLimit);
  let type: string | null = null;
  if (time && infusion) type = "Both";
  else if (time) type = "Time";
  else if (infusion) type = "Infusion";
  if (type === null) return null;
  const body: LimitPayload = { type };
  if (time) body.time_limit = limits.timeLimit;
  if (infusion) {
    body.infusion_limit = limits.infusionLimit;
    if (isValidStopDelay(limits.delay)) body.delay = limits.delay;
    // Explicit null is sent on purpose: it means Auto, not "leave unchanged".
    body.counted_pumps = limits.countedPumps ?? null;
  }
  return body;
}
