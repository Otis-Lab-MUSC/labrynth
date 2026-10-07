import type { HardwareUiState } from "../../../types";

export interface PresetDeviceEntry {
  key: keyof Omit<HardwareUiState, "testMode">;
  label: string;
  role: string;
  required: boolean;
}

/** Current shape written by buildPresetFromSession. Absent (built-ins, presets saved earlier)
 *  means every optional field below may be missing, and a missing field leaves the session's
 *  current value alone on apply. */
export const PRESET_VERSION = 2;

export interface SessionPreset {
  id: string;
  version?: number;
  name: string;
  menuLabel?: string;
  paradigm: string;
  description?: string;
  devices: PresetDeviceEntry[];
  hardware: Partial<HardwareUiState>;
  paradigmSettings: {
    ratio: number;
    step: number;
    interval: number;
    /** Reinforced lever. Absent in presets saved before this field existed ⇒ "rh". */
    activeLever?: "rh" | "lh";
  };
  pavlovianParams?: Record<number, number>;
  limitDefaults: {
    limitType: string;
    timeLimit: number;
    infusionLimit: number;
    delay: number;
  };
  /** Per-component pin overrides (lowercase Component keys). Absent ⇒ pins are left as they are. */
  pinOverrides?: Record<string, number>;
  DiagramComponent?: React.ComponentType<{ compact?: boolean }>;
}
