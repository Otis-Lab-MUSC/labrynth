import type { HardwareUiState } from "../../../types";

export interface PresetDeviceEntry {
  key: keyof Omit<HardwareUiState, "testMode" | "activeLever">;
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
    traceInterval: number;
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
