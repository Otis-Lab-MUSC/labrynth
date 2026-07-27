import type { SessionPreset, PresetDeviceEntry } from "./types";
import type { HardwareUiState } from "../../../types";
import {
  CORE_DEVICES,
  PUMP_DEVICE,
  OPTIONAL_DEVICES,
  CORE_HARDWARE,
  PUMP_HARDWARE,
  OPTIONAL_HARDWARE,
  PARADIGM_SETTINGS,
} from "./frSaPresets";

/* fr_lite is identical to fr except it has no two-photon hardware
 * (microscope, SLM) — these presets mirror frSaPresets.ts with those two
 * devices stripped out. */

const LITE_OPTIONAL_DEVICES: PresetDeviceEntry[] = OPTIONAL_DEVICES.filter(
  (d) => d.key !== "microscope" && d.key !== "slm"
);

const { microscope: _microscope, slm: _slm, ...LITE_OPTIONAL_HARDWARE } = OPTIONAL_HARDWARE;

export const SA_HIGH_LITE_PRESET: SessionPreset = {
  id: "sa-high-lite",
  name: "Self-Administration - High Day (Lite)",
  menuLabel: "SA High",
  paradigm: "fr_lite",
  devices: [...CORE_DEVICES, PUMP_DEVICE, ...LITE_OPTIONAL_DEVICES],
  hardware: { ...CORE_HARDWARE, ...PUMP_HARDWARE, ...LITE_OPTIONAL_HARDWARE },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Both", timeLimit: 3600, infusionLimit: 10, delay: 10 },
};

export const SA_MID_LITE_PRESET: SessionPreset = {
  id: "sa-mid-lite",
  name: "Self-Administration - Mid Day (Lite)",
  menuLabel: "SA Mid",
  paradigm: "fr_lite",
  devices: [...CORE_DEVICES, PUMP_DEVICE, ...LITE_OPTIONAL_DEVICES],
  hardware: { ...CORE_HARDWARE, ...PUMP_HARDWARE, ...LITE_OPTIONAL_HARDWARE },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Both", timeLimit: 3600, infusionLimit: 20, delay: 10 },
};

export const SA_LOW_LITE_PRESET: SessionPreset = {
  id: "sa-low-lite",
  name: "Self-Administration - Low Day (Lite)",
  menuLabel: "SA Low",
  paradigm: "fr_lite",
  devices: [...CORE_DEVICES, PUMP_DEVICE, ...LITE_OPTIONAL_DEVICES],
  hardware: { ...CORE_HARDWARE, ...PUMP_HARDWARE, ...LITE_OPTIONAL_HARDWARE },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Both", timeLimit: 3600, infusionLimit: 40, delay: 10 },
};

const EXTINCTION_LITE_DEVICES: PresetDeviceEntry[] = [
  { key: "rhLever",     label: "RH Lever", role: "Active lever — tracked but no reward", required: true },
  { key: "lhLever",     label: "LH Lever", role: "Inactive lever — tracking only",       required: true },
  { key: "primaryCue",  label: "Cue 1",    role: "Disabled during extinction",           required: false },
  { key: "primaryPump", label: "Pump 1",   role: "Disabled during extinction",           required: false },
  ...LITE_OPTIONAL_DEVICES,
];

export const SA_EXTINCTION_LITE_PRESET: SessionPreset = {
  id: "sa-extinction-lite",
  name: "Self-Administration - Extinction (Lite)",
  menuLabel: "SA Extinction",
  paradigm: "fr_lite",
  devices: EXTINCTION_LITE_DEVICES,
  hardware: {
    rhLever: { armed: true, timeout: 20000, ratio: 1 },
    lhLever: { armed: true, timeout: 20000, ratio: 1 },
    primaryCue:  { armed: false, frequency: 8000, duration: 1600,
      contingency: { leverFilter: "none", delay: 0 } },
    primaryPump: { armed: false, duration: 2000,
      contingency: { leverFilter: "none", delay: 1600 } },
    ...LITE_OPTIONAL_HARDWARE,
  } as Partial<HardwareUiState>,
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Time", timeLimit: 3600, infusionLimit: 30, delay: 10 },
};
