import type {
  HardwareUiState,
  LeverUiState,
  CueUiState,
  PumpUiState,
  LaserUiState,
  MicroscopeUiState,
  SlmUiState,
  DeviceArmState,
} from "../../types";

// Display labels for every device surfaced in the start-summary Hardware table.
export const DEVICE_LABELS: Record<string, string> = {
  rhLever: "RH Lever",
  lhLever: "LH Lever",
  primaryCue: "Cue 1",
  secondaryCue: "Cue 2",
  primaryPump: "Pump 1",
  secondaryPump: "Pump 2",
  laser: "Laser",
  lickCircuit: "Lick Circuit",
  microscope: "Microscope",
  slm: "SLM",
};

export interface SummaryContext {
  /** Pavlovian paradigm — drives laser mode/phase display and hides press-contingency. */
  isPav: boolean;
  /** Paradigm is press-contingent (operant, non-omission) — gates lever-routing display. */
  pressContingent: boolean;
}

// Every device in HardwareUiState except the testMode flag. Keying FORMATTERS by
// this union as a mapped type makes the summary renderer exhaustive: add a device
// to HardwareUiState and the build fails here until it gets a formatter — the guard
// against the summary silently drifting from the configured-hardware schema (#78).
type SummaryDeviceKey = Exclude<keyof HardwareUiState, "testMode">;

const leverFilterLabel: Record<"rh" | "lh", string> = { rh: "RH", lh: "LH" };

// Single source of truth for the two gates that the start-summary and the
// handleStart send-path must agree on (#80). Both the display formatters here and
// SessionStartModal's command emission derive from these, so what is sent to the
// firmware can never diverge from what the confirmation modal shows.

/** Lever-routing filter (378/388/478/488) — sent/shown only for press-contingent paradigms. */
export function leverFilterActive(
  leverFilter: "none" | "rh" | "lh" | undefined,
  pressContingent: boolean,
): leverFilter is "rh" | "lh" {
  return pressContingent && leverFilter !== undefined && leverFilter !== "none";
}

/**
 * Pavlovian laser phase (694/695) — sent/shown only for a Pavlovian, trial-paired
 * (non-independent) laser with a phase set. `isPav` is encoded in the predicate (not
 * just asserted at the call site) so the gate is indivisible — mirroring how
 * `leverFilterActive` carries `pressContingent`.
 */
export function laserPhaseActive(
  isPav: boolean,
  mode: LaserUiState["mode"] | undefined,
  phase: "reward" | "cue" | undefined,
): phase is "reward" | "cue" {
  return isPav && mode !== "independent" && phase !== undefined;
}

function contingencyParts(c: { leverFilter: "none" | "rh" | "lh"; delay: number }, ctx: SummaryContext): string[] {
  const parts: string[] = [];
  if (leverFilterActive(c.leverFilter, ctx.pressContingent)) parts.push(leverFilterLabel[c.leverFilter]);
  if (c.delay > 0) parts.push(`Delay:${c.delay}ms`);
  return parts;
}

function leverParts(s: LeverUiState): string[] {
  return [`T:${s.timeout / 1000}s`, `R:${s.ratio}`];
}

function cueParts(s: CueUiState, ctx: SummaryContext): string[] {
  return [`${s.frequency}Hz`, `${s.duration}ms`, ...contingencyParts(s.contingency, ctx)];
}

function pumpParts(s: PumpUiState, ctx: SummaryContext): string[] {
  return [`${s.duration}ms`, ...contingencyParts(s.contingency, ctx)];
}

const pavModeLabel: Record<"cs_plus" | "cs_minus" | "cs_both", string> = {
  cs_plus: "CS+", cs_minus: "CS−", cs_both: "CS±",
};
const laserRoutingLabel: Record<LaserUiState["contingency"], string> = {
  any: "Any", rh: "RH", lh: "LH", independent: "Independent",
};

function laserParts(s: LaserUiState, ctx: SummaryContext): string[] {
  const parts: string[] = [`${s.frequency}Hz`, `${s.duration}ms`];
  if (s.onsetDelay > 0) parts.push(`Delay:${s.onsetDelay}ms`);
  if (ctx.isPav) {
    // Pavlovian: `mode` is authoritative (independent vs. trial-paired CS filter) + phase.
    // Any non-independent mode is trial-paired; only cs_* carry a specific filter label.
    // The default/leftover modes ("contingent", "rh_lever", "lh_lever") must still read as Trial-Paired
    // rather than silently dropping the routing token (#78).
    if (s.mode === "independent") {
      parts.push("Independent");
    } else if (s.mode === "cs_plus" || s.mode === "cs_minus" || s.mode === "cs_both") {
      parts.push(`Trial-Paired (${pavModeLabel[s.mode]})`);
    } else {
      parts.push("Trial-Paired");
    }
    if (laserPhaseActive(ctx.isPav, s.mode, s.phase)) {
      const phaseLabel: Record<"reward" | "cue", string> = { reward: "Reward", cue: "Cue" };
      parts.push(`Phase: ${phaseLabel[s.phase]}`);
    }
  } else {
    // Operant: `contingency` is authoritative routing — `mode` is only touched by the
    // Pavlovian UI and can be stale here, so it must NOT drive the summary (#78).
    parts.push(`Contingent: ${laserRoutingLabel[s.contingency]}`);
  }
  return parts;
}

function microscopeParts(s: MicroscopeUiState): string[] {
  const parts: string[] = [];
  if (s.frameRate != null) parts.push(`${s.frameRate}fps`);
  if (s.frameAveraging != null) parts.push(`Avg:${s.frameAveraging}`);
  return parts;
}

function slmParts(s: SlmUiState): string[] {
  return [`Pin:${s.pin}`];
}

// Exhaustive per-device formatters. The mapped-type key set is the drift guard (see above).
const FORMATTERS: { [K in SummaryDeviceKey]: (state: HardwareUiState[K], ctx: SummaryContext) => string[] } = {
  rhLever: leverParts,
  lhLever: leverParts,
  primaryCue: cueParts,
  secondaryCue: cueParts,
  primaryPump: pumpParts,
  secondaryPump: pumpParts,
  laser: laserParts,
  lickCircuit: (_s: DeviceArmState) => [],
  microscope: microscopeParts,
  slm: slmParts,
};

/**
 * Format an armed device's configured settings for the start-summary Hardware table.
 * `key` comes from Object.entries(hardwareUi), so the lookup is the one typed boundary;
 * the FORMATTERS bodies stay fully typed so the exhaustiveness guard holds.
 */
export function formatDeviceParams(key: string, state: Record<string, unknown>, ctx: SummaryContext): string {
  const fn = FORMATTERS[key as SummaryDeviceKey] as ((s: unknown, ctx: SummaryContext) => string[]) | undefined;
  if (!fn) return "";
  return fn(state, ctx).join("  ");
}
