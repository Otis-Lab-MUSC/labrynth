// GENERATED FILE — do not edit by hand.
// Source: reacher schema v1, firmware_surface.device_names
// (which reacher release: see the reacher2p pin in pyproject.toml)
// Regenerate: npm run gen:tables
//
// Firmware spells devices differently per log level, and the kernel rewrites
// some names before the browser sees them. Compare a WebSocket event's device
// against EventDevice, a config record's against ConfigDevice; never mix them.

/** `device` of a WebSocket 'event' message: firmware level 007 after the kernel's rewrites, plus SLM (level 009). */
export const EVENT_DEVICES = [
  "AUX_1",
  "CONTROLLER",
  "CUE",
  "CUE_1",
  "CUE_2",
  "LASER",
  "LEVER_LH",
  "LEVER_RH",
  "LICK",
  "PAVLOV",
  "PUMP",
  "PUMP_1",
  "PUMP_2",
  "SLM",
] as const;
export type EventDevice = (typeof EVENT_DEVICES)[number];

/** `device` of a firmware config record (level 000), as in /api/hardware/{id}/config `hardware_settings`. */
export const CONFIG_DEVICES = [
  "AUX",
  "CONTROLLER",
  "CUE",
  "CUE2",
  "LASER",
  "LEVER_LH",
  "LEVER_RH",
  "LICK",
  "MICROSCOPE",
  "PUMP",
  "PUMP2",
  "SLM",
] as const;
export type ConfigDevice = (typeof CONFIG_DEVICES)[number];
