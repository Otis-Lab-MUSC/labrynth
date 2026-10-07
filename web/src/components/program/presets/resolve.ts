import type { Session } from "../../../types";
import type { SessionPreset } from "./types";
import { PARADIGM_DEFAULTS, defaultLimitSettings } from "./deviceMetadata";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Preset blobs round-trip through localStorage, so a preset saved by an older build can lack any
 *  field the current type declares. A missing/garbled field keeps the session's current value
 *  instead of writing undefined/NaN over it. */
export function resolveParadigmSettings(
  preset: SessionPreset,
  current: Session["paradigmSettings"],
): NonNullable<Session["paradigmSettings"]> {
  const base = current ?? { ...PARADIGM_DEFAULTS };
  const p = (preset.paradigmSettings ?? {}) as Partial<SessionPreset["paradigmSettings"]>;
  return {
    ...base,
    ...(isNum(p.ratio) ? { ratio: p.ratio } : {}),
    ...(isNum(p.step) ? { step: p.step } : {}),
    ...(isNum(p.interval) ? { interval: p.interval } : {}),
    ...(p.activeLever === "rh" || p.activeLever === "lh" ? { activeLever: p.activeLever } : {}),
  };
}

export function resolveLimits(
  preset: SessionPreset,
  current: Session["limitSettings"],
  paradigm: string | null | undefined,
): NonNullable<Session["limitSettings"]> {
  const base = current ?? defaultLimitSettings(paradigm);
  const l = (preset.limitDefaults ?? {}) as Partial<SessionPreset["limitDefaults"]>;
  const allowed = paradigm === "pavlovian" ? ["Trials", "Infusion"] : ["Time", "Infusion", "Both"];
  return {
    ...base,
    ...(typeof l.limitType === "string" && allowed.includes(l.limitType) ? { limitType: l.limitType } : {}),
    ...(isNum(l.timeLimit) ? { timeLimit: l.timeLimit } : {}),
    ...(isNum(l.infusionLimit) ? { infusionLimit: l.infusionLimit } : {}),
    ...(isNum(l.delay) ? { delay: l.delay } : {}),
  };
}
