// GENERATED FILE — do not edit by hand.
// Source: reacher 3.4.0-alpha.7, python.known_firmware_gaps
// Regenerate: npm run gen:gaps
//
// Commands the UI can send that some paradigms' firmware does not handle.
// Controls for these must be disabled (not hidden) on the listed paradigms.

export interface FirmwareGap {
  /** Exact paradigm strings, including "_lite" twins — compare the raw value. */
  paradigms: readonly string[];
  /** Why firmware does not handle it, and what happens if it is sent anyway. */
  reason: string;
  /** How the UI should present the gap. */
  uiGuidance: string;
}

export const FIRMWARE_GAPS = {
  LASER_TRIGGER_LH_ONLY: {
    paradigms: ["vi", "vi_lite", "omission", "omission_lite"] as readonly string[],
    reason: "vi and omission handle only LASER_TRIGGER_RH_ONLY and have no LASER_LEVER_FILTER global at all; ReconfigureChain hardcodes sourceFilter = LEVER_RH. Code 685 therefore reaches the default case, so LASER_RH_ONLY_MODE keeps its previous value and no reconfigure happens. Selecting 'LH only' does not disable the laser — it leaves the prior contingency in force, which can mean stimulation on RH presses while the protocol says LH, for a whole session, in data that looks normal. fr.ino and pr.ino show the intended shape. Firmware does emit a level-006 naming the code.",
    uiGuidance: "Disable the 'LH lever' laser contingency on vi and omission and say why — do not hide it. A hidden control reads as absent hardware, and an 'lh' preset applied on vi would then no-op with nothing on screen to explain the mismatch. Derive the gate from this entry, never hand-write it, or the gate will outlive the gap.",
  },
} as const satisfies Record<string, FirmwareGap>;

/** True when `paradigm` is one the given command is silently unhandled on. */
export function hasFirmwareGap(
  gap: FirmwareGap,
  paradigm: string | null | undefined,
): boolean {
  return !!paradigm && gap.paradigms.includes(paradigm);
}
