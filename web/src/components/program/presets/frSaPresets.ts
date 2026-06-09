import type { SessionPreset, PresetDeviceEntry } from "./types";
import type { HardwareUiState } from "../../../types";

/* ── Shared device entries ─────────────────────────────────────────── */

const CORE_DEVICES: PresetDeviceEntry[] = [
  { key: "rhLever",    label: "RH Lever", role: "Active lever — triggers reward chain", required: true },
  { key: "lhLever",    label: "LH Lever", role: "Inactive lever — tracking only",       required: true },
  { key: "primaryCue", label: "CUE 1",    role: "Tone cue — signals reward",            required: true },
];

const PUMP_DEVICE: PresetDeviceEntry = {
  key: "primaryPump", label: "PUMP 1", role: "Syringe pump — delivers infusion", required: true,
};

const OPTIONAL_DEVICES: PresetDeviceEntry[] = [
  { key: "laser",       label: "Laser",       role: "Optogenetic stimulus — paired with pump", required: false },
  { key: "lickCircuit", label: "Lick Circuit", role: "Lick detection — user-enabled",          required: false },
  { key: "microscope",  label: "Microscope",   role: "Imaging sync — user-enabled",            required: false },
  { key: "slm",         label: "SLM",          role: "SLM timestamps — user-enabled",          required: false },
];

/* ── Shared hardware settings ──────────────────────────────────────── */

const CORE_HARDWARE: Partial<HardwareUiState> = {
  rhLever:    { armed: true,  timeout: 20000, ratio: 1 },
  lhLever:    { armed: true,  timeout: 20000, ratio: 1 },
  primaryCue: { armed: true,  frequency: 8000, duration: 1600,
    contingency: { leverFilter: "rh", delay: 0 } },
};

const PUMP_HARDWARE: Partial<HardwareUiState> = {
  primaryPump: { armed: true, duration: 2000,
    contingency: { leverFilter: "rh", delay: 0 } },
};

const OPTIONAL_HARDWARE: Partial<HardwareUiState> = {
  laser:        { armed: false, frequency: 40, duration: 5000, mode: "contingent" as const },
  lickCircuit:  { armed: false },
  microscope:   { armed: false, frameRate: null, frameAveraging: null },
  slm:          { armed: false, pin: 11 },
  secondaryCue: { armed: false, frequency: 2900, duration: 1000,
    contingency: { leverFilter: "none", delay: 0 } },
  secondaryPump: { armed: false, duration: 3000,
    contingency: { leverFilter: "none", delay: 0 } },
};

/* ── Shared paradigm settings ──────────────────────────────────────── */

const PARADIGM_SETTINGS: SessionPreset["paradigmSettings"] = {
  ratio: 1,
  step: 1,
  interval: 30000,
  traceInterval: 0,
};

/* ── Presets ───────────────────────────────────────────────────────── */

export const SA_HIGH_PRESET: SessionPreset = {
  id: "sa-high",
  name: "Self-Administration - High Day",
  menuLabel: "SA High",
  paradigm: "fr",
  devices: [...CORE_DEVICES, PUMP_DEVICE, ...OPTIONAL_DEVICES],
  hardware: { ...CORE_HARDWARE, ...PUMP_HARDWARE, ...OPTIONAL_HARDWARE },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Both", timeLimit: 3600, infusionLimit: 10, delay: 10 },
};

export const SA_MID_PRESET: SessionPreset = {
  id: "sa-mid",
  name: "Self-Administration - Mid Day",
  menuLabel: "SA Mid",
  paradigm: "fr",
  devices: [...CORE_DEVICES, PUMP_DEVICE, ...OPTIONAL_DEVICES],
  hardware: { ...CORE_HARDWARE, ...PUMP_HARDWARE, ...OPTIONAL_HARDWARE },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Both", timeLimit: 3600, infusionLimit: 20, delay: 10 },
};

export const SA_LOW_PRESET: SessionPreset = {
  id: "sa-low",
  name: "Self-Administration - Low Day",
  menuLabel: "SA Low",
  paradigm: "fr",
  devices: [...CORE_DEVICES, PUMP_DEVICE, ...OPTIONAL_DEVICES],
  hardware: { ...CORE_HARDWARE, ...PUMP_HARDWARE, ...OPTIONAL_HARDWARE },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Both", timeLimit: 3600, infusionLimit: 40, delay: 10 },
};

const EXTINCTION_DEVICES: PresetDeviceEntry[] = [
  { key: "rhLever",     label: "RH Lever", role: "Active lever — tracked but no reward", required: true },
  { key: "lhLever",     label: "LH Lever", role: "Inactive lever — tracking only",       required: true },
  { key: "primaryCue",  label: "CUE 1",    role: "Disabled during extinction",           required: false },
  { key: "primaryPump", label: "PUMP 1",   role: "Disabled during extinction",           required: false },
  ...OPTIONAL_DEVICES,
];

export const SA_EXTINCTION_PRESET: SessionPreset = {
  id: "sa-extinction",
  name: "Self-Administration - Extinction",
  menuLabel: "SA Extinction",
  paradigm: "fr",
  devices: EXTINCTION_DEVICES,
  hardware: {
    rhLever: { armed: true, timeout: 20000, ratio: 1 },
    lhLever: { armed: true, timeout: 20000, ratio: 1 },
    primaryCue:  { armed: false, frequency: 8000, duration: 1600,
      contingency: { leverFilter: "none", delay: 0 } },
    primaryPump: { armed: false, duration: 2000,
      contingency: { leverFilter: "none", delay: 0 } },
    ...OPTIONAL_HARDWARE,
  },
  paradigmSettings: PARADIGM_SETTINGS,
  limitDefaults: { limitType: "Time", timeLimit: 3600, infusionLimit: 30, delay: 10 },
};
