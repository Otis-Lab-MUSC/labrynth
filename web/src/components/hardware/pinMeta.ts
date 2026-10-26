/**
 * Pin metadata for runtime pin reassignment.
 *
 * The facts mirrored from reacher (component keys, SET_PIN codes, role
 * constraints, Pins.h defaults, board pin sets) are generated into
 * `src/generated/pinTables.ts` from reacher's schema dump (`npm run
 * gen:tables`) and re-exported here; CI fails if they drift. This file keeps
 * what is ours: the grid order, labels, which interrupt pins a component may
 * take, and the board lookups. The microscope timestamp pin is intentionally
 * NOT remappable (fixed at INT0 / pin 2).
 *
 * reacher's frontend-parity checks read this file and the generated one as
 * text (`mcp/sources/ts.py` `parse_pin_meta`), by these names:
 *
 *   Component (the union)   COMPONENT_KEYS          SET_PIN_CODE
 *   DEFAULT_PIN             COMPONENT_REQUIRES_PWM  COMPONENT_REQUIRES_PCINT
 *   COMPONENT_REQUIRES_INT  UNO_DIGITAL/PWM/PCINT0  MEGA_DIGITAL/PWM/MEGA_PCINT0
 *
 * so renaming one fails reacher's CI, not ours. `*_INT_ASSIGNABLE` and
 * `COMPONENT_LABEL` are ours alone and unparsed.
 *
 * It reads these files **off disk, from the sibling checkout**, with no git
 * ref involved, so reacher's parity results reflect whatever is checked out
 * here. If its parity suite disagrees with what you expect, check which branch
 * this working tree is on before believing the diff.
 */

import type { BoardType } from "../../types";
import {
  COMPONENT_MEGA_ONLY,
  COMPONENT_REQUIRES_INT,
  COMPONENT_REQUIRES_PCINT,
  COMPONENT_REQUIRES_PWM,
  DEFAULT_PIN,
  MEGA_DIGITAL,
  MEGA_INT,
  MEGA_PCINT0,
  MEGA_PWM,
  UNO_DIGITAL,
  UNO_INT,
  UNO_PCINT0,
  UNO_PWM,
  type Component,
} from "../../generated/pinTables";

export type { Component };
export {
  COMPONENT_MEGA_ONLY,
  COMPONENT_REQUIRES_INT,
  COMPONENT_REQUIRES_PCINT,
  COMPONENT_REQUIRES_PWM,
  DEFAULT_PIN,
  MEGA_DIGITAL,
  MEGA_PCINT0,
  MEGA_PWM,
  UNO_DIGITAL,
  UNO_PCINT0,
  UNO_PWM,
};
export { SET_PIN_CODE } from "../../generated/pinTables";

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
  "aux",
] as const;

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
  aux: "Shock Output",
};

// Interrupt pins a component may take: the board's interrupt set minus pin 2
// (the fixed microscope timestamp, INT0) and the primary cue's default pin.
// On the UNO that leaves none; on the Mega, INT2-INT5.
const spokenFor = new Set([2, DEFAULT_PIN.cue]);
export const UNO_INT_ASSIGNABLE: readonly number[] = UNO_INT.filter((p) => !spokenFor.has(p));
export const MEGA_INT_ASSIGNABLE: readonly number[] = MEGA_INT.filter((p) => !spokenFor.has(p));

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
 * Return the pins assignable to an interrupt-restricted component. Mirrors
 * `pin_overrides.validate_pin`'s `allowed_pins` branch. Currently no component
 * requires an interrupt pin (see COMPONENT_REQUIRES_INT).
 */
export function intPinsFor(board: BoardType | null | undefined): readonly number[] {
  return board === "uno" ? UNO_INT_ASSIGNABLE : MEGA_INT_ASSIGNABLE;
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
  const requireInt = COMPONENT_REQUIRES_INT[component];
  const digital = requireInt
    ? intPinsFor(board)
    : requirePcint
      ? pcint0PinsFor(board)
      : digitalPinsFor(board);
  if (COMPONENT_MEGA_ONLY[component] && board !== "mega") return [];
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
