import type { SessionPreset, PresetDeviceEntry } from "./types";
import type { HardwareUiState } from "../../../types";

/* ── Shared device entries ─────────────────────────────────────────── */

const CORE_DEVICES: PresetDeviceEntry[] = [
  { key: "primaryCue",   label: "Cue 1",  role: "CS+ tone — predicts reward",      required: true },
  { key: "secondaryCue", label: "Cue 2",  role: "CS- tone — no reward",            required: true },
  { key: "primaryPump",  label: "Pump 1", role: "Syringe pump — delivers reward",  required: true },
];

const OPTIONAL_DEVICES: PresetDeviceEntry[] = [
  { key: "laser",       label: "Laser",       role: "Optogenetic stimulus — trial-paired or independent", required: false },
  { key: "lickCircuit", label: "Lick Circuit", role: "Lick detection — user-enabled",                    required: false },
  { key: "microscope",  label: "Microscope",   role: "Imaging sync — user-enabled",                      required: false },
  { key: "slm",         label: "SLM",          role: "SLM timestamps — user-enabled",                    required: false },
];

/* ── Shared hardware settings ──────────────────────────────────────── */

const CORE_HARDWARE: Partial<HardwareUiState> = {
  primaryCue:   { armed: true,  frequency: 12000, duration: 2000,
    contingency: { leverFilter: "none", delay: 0 } },
  secondaryCue: { armed: true,  frequency: 3000,  duration: 2000,
    contingency: { leverFilter: "none", delay: 0 } },
  primaryPump:  { armed: true,  duration: 2000,
    contingency: { leverFilter: "none", delay: 0 } },
};

const OPTIONAL_HARDWARE: Partial<HardwareUiState> = {
  laser:       { armed: false, frequency: 40, duration: 5000, mode: "cs_plus" as const, phase: "reward" as const },
  lickCircuit: { armed: true },
  microscope:  { armed: false, frameRate: null, frameAveraging: null },
  slm:         { armed: false, pin: 11 },
};

/* ── Dummy paradigm settings (not used by Pavlovian, required by type) */

const PARADIGM_SETTINGS: SessionPreset["paradigmSettings"] = {
  ratio: 1,
  step: 1,
  interval: 0,
  traceInterval: 0,
};

/* ── Presets ───────────────────────────────────────────────────────── */

export const PAV_ACQUISITION_PRESET: SessionPreset = {
  id: "pav-acquisition",
  name: "Pavlovian - Acquisition",
  menuLabel: "Acquisition",
  paradigm: "pavlovian",
  devices: [...CORE_DEVICES, ...OPTIONAL_DEVICES],
  hardware: {
    ...CORE_HARDWARE,
    ...OPTIONAL_HARDWARE,
    laser: { armed: true, frequency: 40, duration: 5000, mode: "cs_plus" as const, phase: "reward" as const },
    lickCircuit: { armed: true },
  },
  paradigmSettings: PARADIGM_SETTINGS,
  pavlovianParams: {
    206: 100,   // CS+ Reward Prob (%)
    207: 0,     // CS- Reward Prob (%)
    208: 50,    // CS+ Count
    209: 50,    // CS- Count
    212: 0,     // Counterbalance (off)
    214: 1000,  // Trace Interval (ms)
    215: 5000,  // Consumption Window (ms)
    216: 30000, // ITI Mean (ms)
    217: 20000, // ITI Min (ms)
    218: 50000, // ITI Max (ms)
    219: 0,     // Pulse Config
    374: 0,     // CS+ Pulse On (ms) — continuous
    375: 0,     // CS+ Pulse Off (ms)
    384: 200,   // CS- Pulse On (ms)
    385: 200,   // CS- Pulse Off (ms)
  },
  limitDefaults: { limitType: "Trials", timeLimit: 7200, infusionLimit: 100, delay: 10 },
};

export const PAV_REVERSAL_PRESET: SessionPreset = {
  id: "pav-reversal",
  name: "Pavlovian - Reversal",
  menuLabel: "Reversal",
  paradigm: "pavlovian",
  devices: [...CORE_DEVICES, ...OPTIONAL_DEVICES],
  hardware: {
    ...CORE_HARDWARE,
    ...OPTIONAL_HARDWARE,
    laser: { armed: true, frequency: 40, duration: 5000, mode: "cs_plus" as const, phase: "reward" as const },
    lickCircuit: { armed: true },
  },
  paradigmSettings: PARADIGM_SETTINGS,
  pavlovianParams: {
    206: 0,     // CS+ Reward Prob (%) — reversed
    207: 100,   // CS- Reward Prob (%) — reversed
    208: 50,    // CS+ Count
    209: 50,    // CS- Count
    212: 0,     // Counterbalance (off)
    214: 1000,  // Trace Interval (ms)
    215: 5000,  // Consumption Window (ms)
    216: 30000, // ITI Mean (ms)
    217: 20000, // ITI Min (ms)
    218: 50000, // ITI Max (ms)
    219: 0,     // Pulse Config
    374: 0,     // CS+ Pulse On (ms) — continuous
    375: 0,     // CS+ Pulse Off (ms)
    384: 200,   // CS- Pulse On (ms)
    385: 200,   // CS- Pulse Off (ms)
  },
  limitDefaults: { limitType: "Trials", timeLimit: 7200, infusionLimit: 100, delay: 10 },
};
