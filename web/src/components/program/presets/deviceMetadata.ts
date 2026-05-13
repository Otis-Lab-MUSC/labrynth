import type { HardwareUiState } from "../../../types";
import type { Session } from "../../../types";
import type { SessionPreset, PresetDeviceEntry } from "./types";

type DeviceKey = keyof Omit<HardwareUiState, "testMode">;

const DEVICE_METADATA: Record<DeviceKey, { label: string; role: string }> = {
  rhLever:       { label: "RH Lever",       role: "Right-hand lever" },
  lhLever:       { label: "LH Lever",       role: "Left-hand lever" },
  primaryCue:    { label: "Primary Cue",    role: "Primary auditory cue" },
  secondaryCue:  { label: "Secondary Cue",  role: "Secondary auditory cue" },
  primaryPump:   { label: "Primary Pump",   role: "Primary syringe pump" },
  secondaryPump: { label: "Secondary Pump", role: "Secondary syringe pump" },
  laser:         { label: "Laser",          role: "Optogenetic stimulus" },
  lickCircuit:   { label: "Lick Circuit",   role: "Lick detection" },
  microscope:    { label: "Microscope",     role: "Imaging synchronization" },
};

function buildDeviceEntries(hw: HardwareUiState): PresetDeviceEntry[] {
  return (Object.keys(DEVICE_METADATA) as DeviceKey[]).map((key) => {
    const device = hw[key];
    const armed = typeof device === "object" && "armed" in device && device.armed;
    return {
      key,
      label: DEVICE_METADATA[key].label,
      role: DEVICE_METADATA[key].role,
      required: !!armed,
    };
  });
}

const DEFAULT_PARADIGM_SETTINGS: SessionPreset["paradigmSettings"] = {
  ratio: 1,
  step: 1,
  interval: 0,
  traceInterval: 0,
};

const DEFAULT_LIMIT_SETTINGS: SessionPreset["limitDefaults"] = {
  limitType: "Both",
  timeLimit: 3600,
  infusionLimit: 30,
  delay: 10,
};

export function buildPresetFromSession(name: string, session: Session): SessionPreset {
  const { testMode: _, ...hardware } = session.hardwareUi;

  return {
    id: "user-" + crypto.randomUUID(),
    name,
    paradigm: session.paradigm ?? "fr",
    devices: buildDeviceEntries(session.hardwareUi),
    hardware,
    paradigmSettings: session.paradigmSettings ?? { ...DEFAULT_PARADIGM_SETTINGS },
    ...(session.pavlovianParams ? { pavlovianParams: { ...session.pavlovianParams } } : {}),
    limitDefaults: session.limitSettings ?? { ...DEFAULT_LIMIT_SETTINGS },
  };
}
