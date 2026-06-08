import type { HardwareUiState } from "../../types";

export interface DevicePreset {
  id: string;
  name: string;
  description: string;
  paradigms: string[] | null; // null = all paradigms
  hardware: Partial<HardwareUiState>;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // Populate with experiment-specific presets. Example shape:
  // {
  //   id: "fr-standard",
  //   name: "Standard FR",
  //   description: "RH lever + primary cue + primary pump",
  //   paradigms: ["fr", "pr"],
  //   hardware: {
  //     rhLever: { armed: true, timeout: 20000, ratio: 1 },
  //     primaryCue: { armed: true, frequency: 2900, duration: 1000 },
  //     primaryPump: { armed: true, duration: 3000 },
  //   },
  // },
];

/** Command code for laser mode: contingent = 681, independent = 682, rh_lever = 684, Pavlovian trial types = 691-693 */
export const LASER_MODE_COMMANDS = {
  contingent: 681, independent: 682, rh_lever: 684,
  cs_plus: 691, cs_minus: 692, cs_both: 693,
} as const;

/** Command codes for Pavlovian laser phase selection */
export const PAV_LASER_PHASE_COMMANDS = { reward: 694, cue: 695 } as const;

export const PRESET_COMMAND_MAP: Record<string, { arm: number; disarm: number; params?: Record<string, number> }> = {
  rhLever:       { arm: 1001, disarm: 1000, params: { timeout: 1074 } },
  lhLever:       { arm: 1301, disarm: 1300, params: { timeout: 1374 } },
  primaryCue:    { arm: 301,  disarm: 300,  params: { frequency: 371, duration: 372 } },
  secondaryCue:  { arm: 311,  disarm: 310,  params: { frequency: 381, duration: 382 } },
  primaryPump:   { arm: 401,  disarm: 400,  params: { duration: 472 } },
  secondaryPump: { arm: 411,  disarm: 410,  params: { duration: 482 } },
  laser:         { arm: 601,  disarm: 600,  params: { frequency: 671, duration: 672 } },
  lickCircuit:   { arm: 501,  disarm: 500 },
  microscope:    { arm: 901,  disarm: 900 },
  slm:           { arm: 1101, disarm: 1100 },
};
