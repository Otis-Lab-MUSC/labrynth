import type { SessionPreset } from "./types";

export const SA_HIGH_PRESET: SessionPreset = {
  id: "sa-high",
  name: "Self-Administration - High Day",
  menuLabel: "SA High",
  paradigm: "fr",
  devices: [
    { key: "rhLever",     label: "RH Lever",     role: "Active lever — triggers reward chain",     required: true },
    { key: "lhLever",     label: "LH Lever",     role: "Inactive lever — tracking only",           required: true },
    { key: "primaryCue",  label: "Primary Cue",  role: "Tone cue — signals reward",                required: true },
    { key: "primaryPump", label: "Primary Pump",  role: "Syringe pump — delivers infusion",        required: true },
    { key: "laser",       label: "Laser",         role: "Optogenetic stimulus — paired with pump",  required: false },
    { key: "lickCircuit", label: "Lick Circuit",  role: "Lick detection — user-enabled",           required: false },
    { key: "microscope",  label: "Microscope",    role: "Imaging sync — user-enabled",             required: false },
  ],
  hardware: {
    rhLever:     { armed: true,  timeout: 20000, ratio: 1 },
    lhLever:     { armed: true,  timeout: 20000, ratio: 1 },
    primaryCue:  { armed: true,  frequency: 8000, duration: 1600 },
    primaryPump: { armed: true,  duration: 2000 },
    laser:       { armed: false, frequency: 40, duration: 5000 },
    lickCircuit: { armed: false },
    microscope:  { armed: false },
  },
  paradigmSettings: {
    ratio: 1,
    step: 1,
    interval: 30000,
    traceInterval: 0,
  },
  limitDefaults: {
    limitType: "Both",
    timeLimit: 3600,
    infusionLimit: 10,
    delay: 60,
  },
};
