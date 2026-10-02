import type { HardwareUiState } from "../../../types";

export interface PresetDeviceEntry {
  key: keyof Omit<HardwareUiState, "testMode">;
  label: string;
  role: string;
  required: boolean;
}

export interface SessionPreset {
  id: string;
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
  DiagramComponent?: React.ComponentType<{ compact?: boolean }>;
}
