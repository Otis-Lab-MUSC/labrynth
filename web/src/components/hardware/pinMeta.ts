/**
 * Pin metadata for runtime pin reassignment.
 *
 * Mirrors backend `pin_overrides.py`: same component keys, same SET_PIN
 * command codes, same board pin sets and role constraints. The microscope
 * timestamp pin is intentionally NOT remappable (fixed at INT0 / pin 2).
 */

import type { BoardType } from "../../types";

/** Canonical, lowercase component keys. Match backend pin_overrides.SET_PIN_CODE_FOR. */
export type Component =
  | "lever_rh"
  | "lever_lh"
  | "cue"
  | "cue2"
  | "pump"
  | "pump2"
  | "lick"
  | "laser"
  | "microscope_trigger"
  | "slm";

/** Stable order used by the UI grid. */
export const COMPONENT_KEYS: readonly Component[] = [
  "lever_rh",
  "lever_lh",
  "cue",
  "cue2",
  "pump",
  "pump2",
  "lick",
  "laser",
  "microscope_trigger",
  "slm",
] as const;

/** Backend SET_PIN command codes (suffix x76). */
export const SET_PIN_CODE: Record<Component, number> = {
  lever_rh: 1076,
  lever_lh: 1376,
  cue: 376,
  cue2: 386,
  pump: 476,
  pump2: 486,
  lick: 576,
  laser: 676,
  microscope_trigger: 976,
  slm: 1176,
};

/** Human-readable labels for the pin assignment table. */
export const COMPONENT_LABEL: Record<Component, string> = {
  lever_rh: "Right Lever",
  lever_lh: "Left Lever",
  cue: "Primary Cue",
  cue2: "Secondary Cue",
  pump: "Primary Pump",
  pump2: "Secondary Pump",
  lick: "Lick Circuit",
  laser: "Laser",
  microscope_trigger: "Microscope Trigger",
  slm: "SLM Timestamp",
};

/** Components whose pins must support hardware PWM. */
export const COMPONENT_REQUIRES_PWM: Record<Component, boolean> = {
  cue: true,
  cue2: true,
  laser: true,
  lever_rh: false,
  lever_lh: false,
  pump: false,
  pump2: false,
  lick: false,
  microscope_trigger: false,
  slm: false,
};

/** Components restricted to the PCINT0/PORTB group (pins 10–13 on the Mega). */
export const COMPONENT_REQUIRES_PCINT: Record<Component, boolean> = {
  slm: true,
  lever_rh: false,
  lever_lh: false,
  cue: false,
  cue2: false,
  pump: false,
  pump2: false,
  lick: false,
  laser: false,
  microscope_trigger: false,
};

/** Firmware default pins (from reacher/firmware/.../Pins.h). */
export const DEFAULT_PIN: Record<Component, number> = {
  lever_rh: 10,
  lever_lh: 13,
  cue: 3,
  cue2: 7,
  pump: 4,
  pump2: 8,
  lick: 5,
  laser: 6,
  microscope_trigger: 9,
  slm: 11,
};

// --- Board pin sets (must mirror backend pin_overrides.py) ---

const range = (start: number, endInclusive: number): number[] =>
  Array.from({ length: endInclusive - start + 1 }, (_, i) => start + i);

export const UNO_DIGITAL: readonly number[] = range(2, 13);
export const UNO_PWM = new Set([3, 5, 6, 9, 10, 11]);
// UNO_INT = {2, 3} — only used by microscope timestamp (not remappable)

export const MEGA_DIGITAL: readonly number[] = range(2, 53);
export const MEGA_PWM = new Set([...range(2, 13), 44, 45, 46]);
// MEGA_INT = {2, 3, 18, 19, 20, 21} — not exposed (timestamp pin fixed)

// PCINT0 group (PORTB) — valid pins for the SLM timestamp ISR(PCINT0_vect).
// The PORTB pin map differs by board (mirror backend pin_overrides.py):
//   UNO  (ATmega328):  PB0–PB5 == pins 8–13
//   Mega (ATmega2560): PB4–PB7 == pins 10–13 (8/9 are PORTH, not PCINT-capable;
//                      50–53 are the SPI bus and not exposed)
export const UNO_PCINT0: readonly number[] = range(8, 13);
export const MEGA_PCINT0: readonly number[] = [10, 11, 12, 13];

/** Return the digital pins available on a given board. Defaults to UNO. */
export function digitalPinsFor(board: BoardType | null | undefined): readonly number[] {
  return board === "mega" ? MEGA_DIGITAL : UNO_DIGITAL;
}

/** Return PWM-capable pins on a given board. Defaults to UNO. */
export function pwmPinsFor(board: BoardType | null | undefined): Set<number> {
  return board === "mega" ? MEGA_PWM : UNO_PWM;
}

/**
 * Return the PCINT0/PORTB pins valid for the SLM timestamp input.
 *
 * Unlike the other pin sets, an unknown board falls back to the *Mega* set
 * rather than the UNO one (mirror backend `board_sets`). UNO_PCINT0 (8-13) is
 * wider than MEGA_PCINT0 (10-13), so defaulting to it would offer pins 8/9 —
 * PORTH on a Mega, which cannot raise PCINT0_vect. MEGA_PCINT0 is a subset of
 * UNO_PCINT0 and so is valid on both boards.
 */
export function pcint0PinsFor(board: BoardType | null | undefined): readonly number[] {
  return board === "uno" ? UNO_PCINT0 : MEGA_PCINT0;
}

/**
 * Return the list of pins that can validly be assigned to *component* on
 * *board*. Optionally exclude pins already claimed by other components in the
 * working assignment map (live collision avoidance in the UI).
 */
export function validPinsFor(
  component: Component,
  board: BoardType | null | undefined,
  excludePins?: ReadonlySet<number>,
): number[] {
  const requirePcint = COMPONENT_REQUIRES_PCINT[component];
  const digital = requirePcint ? pcint0PinsFor(board) : digitalPinsFor(board);
  const requirePwm = COMPONENT_REQUIRES_PWM[component];
  const pwm = pwmPinsFor(board);
  return [...digital].filter((p) => {
    if (requirePwm && !pwm.has(p)) return false;
    if (excludePins && excludePins.has(p)) return false;
    return true;
  });
}

/** Default pin map (Component → default Arduino pin). */
export function defaultPinOverrides(): Record<Component, number> {
  return { ...DEFAULT_PIN };
}
