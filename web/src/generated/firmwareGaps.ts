// GENERATED FILE — do not edit by hand.
// Source: reacher schema v1, python.known_firmware_gaps
// (which reacher release: see the reacher2p pin in pyproject.toml)
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
  LEVER_RH_SET_RATIO: {
    paradigms: ["fr", "pr", "fr_lite", "pr_lite"] as readonly string[],
    reason: "1075 and 1375 are not per-lever. Both cases call the same scheduler.SetRatio(), which writes triggers[0].threshold on the sketch's single Scheduler instance (Scheduler.cpp:377-383) — and so does 201. The three cases are byte-identical apart from the string passed to logParamChange (fr.ino:322/342/353). Setting RH=5 then LH=3 leaves the board running ratio 3 for both levers, and the next 201 at session start overwrites whatever a lever card last wrote. Firmware then confirms the lie: logParamChange echoes the *requested* value under the per-lever device name without reading scheduler state, so host, log and operator all receive an ACK for a per-lever ratio the board never stored. Ratio is not even lever-scoped conceptually — configureFixedRatio sets sourceFilter = NONE (fr/Config.h:52), so with both levers reinforced the single counter pools presses from both.",
    uiGuidance: "Do not offer a ratio control per lever. Offer one scheduler-wide ratio and say so on the control, the way the shared timeout mode is already documented. Derive that from this entry, never hand-write it. Unlike the other gaps there is nothing to disable-and-explain here: a per-lever ratio input cannot be made honest, because the second value silently destroys the first.",
  },
  LEVER_LH_SET_RATIO: {
    paradigms: ["fr", "pr", "fr_lite", "pr_lite"] as readonly string[],
    reason: "1075 and 1375 are not per-lever. Both cases call the same scheduler.SetRatio(), which writes triggers[0].threshold on the sketch's single Scheduler instance (Scheduler.cpp:377-383) — and so does 201. The three cases are byte-identical apart from the string passed to logParamChange (fr.ino:322/342/353). Setting RH=5 then LH=3 leaves the board running ratio 3 for both levers, and the next 201 at session start overwrites whatever a lever card last wrote. Firmware then confirms the lie: logParamChange echoes the *requested* value under the per-lever device name without reading scheduler state, so host, log and operator all receive an ACK for a per-lever ratio the board never stored. Ratio is not even lever-scoped conceptually — configureFixedRatio sets sourceFilter = NONE (fr/Config.h:52), so with both levers reinforced the single counter pools presses from both.",
    uiGuidance: "Do not offer a ratio control per lever. Offer one scheduler-wide ratio and say so on the control, the way the shared timeout mode is already documented. Derive that from this entry, never hand-write it. Unlike the other gaps there is nothing to disable-and-explain here: a per-lever ratio input cannot be made honest, because the second value silently destroys the first.",
  },
} as const satisfies Record<string, FirmwareGap>;

/** True when `paradigm` is one the given command is silently unhandled on. */
export function hasFirmwareGap(
  gap: FirmwareGap,
  paradigm: string | null | undefined,
): boolean {
  return !!paradigm && gap.paradigms.includes(paradigm);
}
