import { asUpload, type CardField, type UploadField } from "../../lib/cardSet";

export type ContingencyDeviceKey = "primaryCue" | "secondaryCue" | "primaryPump" | "secondaryPump";

// Per-device onset delay commands (ms from trigger to device activation)
export const DELAY_CMD: Record<ContingencyDeviceKey, number> = {
  primaryCue:    377,
  secondaryCue:  387, // CUE2_SET_ONSET_DELAY — firmware handler unimplemented; UI suppresses input for secondaryCue
  primaryPump:   477,
  secondaryPump: 487,
};

export const MAX_ONSET_DELAY_MS = 600000;

export function isValidOnsetDelay(ms: number): boolean {
  return ms >= 0 && ms <= MAX_ONSET_DELAY_MS;
}

/** The onset-delay field a cue or pump card sends, or null for Cue 2 (it shares Cue 1's delay). */
export function getDelayField(deviceKey: ContingencyDeviceKey, delay: number): CardField | null {
  if (deviceKey === "secondaryCue") return null;
  return { code: DELAY_CMD[deviceKey], value: delay, valid: isValidOnsetDelay(delay), label: "Delay (ms)" };
}

/** Card id of each cue/pump card; the delay upload is remembered under it. */
export const CARD_ID: Record<ContingencyDeviceKey, string> = {
  primaryCue: "cue",
  secondaryCue: "cue2",
  primaryPump: "pump",
  secondaryPump: "pump2",
};

/** The delay field's upload, or null for Cue 2. */
export function getDelayUpload(deviceKey: ContingencyDeviceKey, delay: number): UploadField | null {
  const field = getDelayField(deviceKey, delay);
  return field ? { ...asUpload(field), scope: CARD_ID[deviceKey] } : null;
}
