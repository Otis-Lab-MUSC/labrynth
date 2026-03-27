export type { SessionPreset, PresetDeviceEntry } from "./types";
export { FR1FlowDiagram } from "./FR1FlowDiagram";
export { SA_HIGH_PRESET, SA_MID_PRESET, SA_LOW_PRESET, SA_EXTINCTION_PRESET } from "./frSaPresets";
export { PAV_ACQUISITION_PRESET, PAV_REVERSAL_PRESET } from "./pavlovianPresets";
export { SessionPresetCard } from "./SessionPresetCard";

import { SA_HIGH_PRESET, SA_MID_PRESET, SA_LOW_PRESET, SA_EXTINCTION_PRESET } from "./frSaPresets";
import { PAV_ACQUISITION_PRESET, PAV_REVERSAL_PRESET } from "./pavlovianPresets";
import type { SessionPreset } from "./types";

export const SESSION_PRESETS: SessionPreset[] = [
  SA_HIGH_PRESET,
  SA_MID_PRESET,
  SA_LOW_PRESET,
  SA_EXTINCTION_PRESET,
  PAV_ACQUISITION_PRESET,
  PAV_REVERSAL_PRESET,
];
