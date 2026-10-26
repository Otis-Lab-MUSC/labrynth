// GENERATED FILE — do not edit by hand.
// Source: reacher schema v1, python.pin_constraints, python.pin_sets,
//   firmware_surface.pins_h
// (which reacher release: see the reacher2p pin in pyproject.toml)
// Regenerate: npm run gen:tables
//
// Re-exported by components/hardware/pinMeta.ts. reacher's frontend parity
// checks parse these declarations by name (mcp/sources/ts.py).

/** Canonical, lowercase component keys (pin_overrides.PIN_CONSTRAINTS). */
export type Component =
  | "cue"
  | "cue2"
  | "pump"
  | "pump2"
  | "lick"
  | "laser"
  | "microscope_trigger"
  | "lever_rh"
  | "slm"
  | "lever_lh"
  | "aux";

/** SET_PIN command codes (suffix x76). */
export const SET_PIN_CODE: Record<Component, number> = {
  cue: 376,
  cue2: 386,
  pump: 476,
  pump2: 486,
  lick: 576,
  laser: 676,
  microscope_trigger: 976,
  lever_rh: 1076,
  slm: 1176,
  lever_lh: 1376,
  aux: 1476,
};

/** Firmware default pins (Pins.h). */
export const DEFAULT_PIN: Record<Component, number> = {
  cue: 3,
  cue2: 7,
  pump: 4,
  pump2: 8,
  lick: 5,
  laser: 6,
  microscope_trigger: 9,
  lever_rh: 10,
  slm: 11,
  lever_lh: 13,
  aux: 22,
};

/** Components whose pins must support hardware PWM. */
export const COMPONENT_REQUIRES_PWM: Record<Component, boolean> = {
  cue: true,
  cue2: true,
  pump: false,
  pump2: false,
  lick: false,
  laser: true,
  microscope_trigger: false,
  lever_rh: false,
  slm: false,
  lever_lh: false,
  aux: false,
};

/** Components restricted to the PCINT0/PORTB group. */
export const COMPONENT_REQUIRES_PCINT: Record<Component, boolean> = {
  cue: false,
  cue2: false,
  pump: false,
  pump2: false,
  lick: false,
  laser: false,
  microscope_trigger: false,
  lever_rh: false,
  slm: true,
  lever_lh: false,
  aux: false,
};

/** Components restricted to pins carrying an external-interrupt line. */
export const COMPONENT_REQUIRES_INT: Record<Component, boolean> = {
  cue: false,
  cue2: false,
  pump: false,
  pump2: false,
  lick: false,
  laser: false,
  microscope_trigger: false,
  lever_rh: false,
  slm: false,
  lever_lh: false,
  aux: false,
};

/** Components that only exist on the Mega; absent means every board. */
export const COMPONENT_MEGA_ONLY: Partial<Record<Component, boolean>> = {
  aux: true,
};

// Board pin sets (pin_overrides.board_sets). *_INT is the full interrupt set;
// which of those a component may take is a rule in pinMeta.ts.

export const MEGA_DIGITAL: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53];
export const MEGA_PWM = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46]);
export const MEGA_INT: readonly number[] = [2, 3, 18, 19, 20, 21];
export const MEGA_PCINT0: readonly number[] = [10, 11, 12, 13];

export const UNO_DIGITAL: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const UNO_PWM = new Set([3, 5, 6, 9, 10, 11]);
export const UNO_INT: readonly number[] = [2, 3];
export const UNO_PCINT0: readonly number[] = [8, 9, 10, 11, 12, 13];
