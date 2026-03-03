export type { SessionPreset, PresetDeviceEntry } from "./types";
export { FR1FlowDiagram } from "./FR1FlowDiagram";
export { SA_HIGH_PRESET, SA_MID_PRESET, SA_LOW_PRESET, SA_EXTINCTION_PRESET } from "./frSaPresets";
export { SessionPresetCard } from "./SessionPresetCard";

import { SA_HIGH_PRESET, SA_MID_PRESET, SA_LOW_PRESET, SA_EXTINCTION_PRESET } from "./frSaPresets";
import type { SessionPreset } from "./types";

export const SESSION_PRESETS: SessionPreset[] = [
  SA_HIGH_PRESET,
  SA_MID_PRESET,
  SA_LOW_PRESET,
  SA_EXTINCTION_PRESET,
];
