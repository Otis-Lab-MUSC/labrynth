// Which armed devices still have settings that must be filled in before a session can start.
// Erasable TS only: node --test imports this directly.
import type { HardwareUiState } from "../types/index.ts";
import {
  SHOCK_LABEL, isValidBlockK, isValidBlockN, isValidDuration as isValidShockDuration,
  isValidProbability,
} from "./auxOutput.ts";

export const MIN_FREQUENCY_HZ = 1;
export const MAX_FREQUENCY_HZ = 65535;
export const MIN_DURATION_MS = 1;
export const MAX_DURATION_MS = 600000;
export const MAX_DELAY_MS = 600000;

/** One armed device and the names of the fields it still needs. */
export interface DeviceNeedingSettings {
  device: string;
  fields: string[];
  /** Settings are valid but were never sent, so the board is not armed yet. Only the shock tracks this. */
  isUnsynced?: boolean;
}

/** What changes which fields a device shows: Pavlovian hides the lever cards and the cue settings. */
export interface ReadinessContext {
  isPavlovian: boolean;
}

/** True when a frequency in Hz is inside the range the firmware accepts. */
export function isValidFrequency(value: number | null): boolean {
  return value !== null && value >= MIN_FREQUENCY_HZ && value <= MAX_FREQUENCY_HZ;
}

/** True when a duration in ms is inside the range the firmware accepts. */
export function isValidDuration(value: number | null): boolean {
  return value !== null && value >= MIN_DURATION_MS && value <= MAX_DURATION_MS;
}

/** True when an onset delay in ms is inside the range the firmware accepts. */
export function isValidDelay(value: number): boolean {
  return value >= 0 && value <= MAX_DELAY_MS;
}

/** Names of the shock output's invalid required fields, in card order. Onset delay and seed are optional. */
function getShockMissingFields(aux: HardwareUiState["aux"]): string[] {
  const missing: string[] = [];
  if (aux.mode === 0 && !isValidProbability(aux.probability)) missing.push("Probability (%)");
  if (aux.mode === 1 && !isValidBlockN(aux.blockN)) missing.push("Rewards per block (N)");
  if (aux.mode === 1 && !isValidBlockK(aux.blockK, aux.blockN)) missing.push("Shocks per block (K)");
  if (!isValidShockDuration(aux.duration)) missing.push("Duration (ms)");
  return missing;
}

/**
 * List every armed device whose required settings are not valid yet. Optional settings (delays,
 * lever timeout, shock onset delay and seed) never block.
 * Start Session is blocked while this list is not empty, so a device never runs with a 0 ms duration.
 */
export function getDevicesNeedingSettings(
  hardware: HardwareUiState,
  context: ReadinessContext,
): DeviceNeedingSettings[] {
  const result: DeviceNeedingSettings[] = [];
  const addIfMissing = (device: string, armed: boolean, missing: string[]) => {
    if (armed && missing.length > 0) result.push({ device, fields: missing });
  };

  if (!context.isPavlovian) {
    for (const [device, cue] of [["Cue 1", hardware.primaryCue], ["Cue 2", hardware.secondaryCue]] as const) {
      const missing: string[] = [];
      if (!isValidFrequency(cue.frequency)) missing.push("Freq (Hz)");
      if (!isValidDuration(cue.duration)) missing.push("Dur (ms)");
      addIfMissing(device, cue.armed, missing);
    }
  }

  for (const [device, pump] of [["Pump 1", hardware.primaryPump], ["Pump 2", hardware.secondaryPump]] as const) {
    addIfMissing(device, pump.armed, isValidDuration(pump.duration) ? [] : ["Duration (ms)"]);
  }

  const laserMissing: string[] = [];
  if (!isValidFrequency(hardware.laser.frequency)) laserMissing.push("Freq (Hz)");
  if (!isValidDuration(hardware.laser.duration)) laserMissing.push("Dur (ms)");
  addIfMissing("Laser", hardware.laser.armed, laserMissing);

  const slmMissing: string[] = [];
  if (!isValidFrequency(hardware.slm.laserFrequency)) slmMissing.push("Laser Freq (Hz)");
  if (!isValidDuration(hardware.slm.laserDuration)) slmMissing.push("Laser Dur (ms)");
  addIfMissing("SLM", hardware.slm.armed, slmMissing);

  const shockMissing = getShockMissingFields(hardware.aux);
  addIfMissing(SHOCK_LABEL, hardware.aux.armed, shockMissing);
  // Start does not re-send the shock settings, so an arm that never reached the board must block it.
  if (hardware.aux.armed && hardware.aux.armPending && shockMissing.length === 0) {
    result.push({ device: SHOCK_LABEL, fields: [], isUnsynced: true });
  }
  return result;
}
