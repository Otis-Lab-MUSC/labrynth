import type { HardwareUiState } from "../../../types";
import type { Session } from "../../../types";
import type { SessionPreset, PresetDeviceEntry } from "./types";

/**
 * HardwareUiState keys that are deliberately NOT part of a session preset.
 *
 * `testMode` is transient session state. `externalTrigger` is a per-run start
 * mode, not a device: it has no arm command of its own, its `armed` flag mirrors
 * live firmware state rather than a configured choice, and its pin belongs to
 * `session.pinOverrides` like every other pin. Including it would put a bogus
 * "External Trigger" row on every preset card — marked *required* whenever the
 * preset happened to be saved while the board was armed — and re-applying that
 * preset would overwrite the live trigger pin.
 *
 * Exported so a cross-repo device-parity check could distinguish an intentional
 * omission from drift. No such consumer exists today — the reacher-side check
 * that read this lived in an MCP implementation that was discarded in favour of
 * a different upstream design. It stays exported because it is still the source
 * of `DeviceKey` below, so the exclusion is enforced by the compiler here even
 * with nothing reading it from outside.
 */
export const PRESET_EXCLUDED_DEVICE_KEYS = ["testMode", "externalTrigger"] as const;

type DeviceKey = keyof Omit<HardwareUiState, (typeof PRESET_EXCLUDED_DEVICE_KEYS)[number]>;

const DEVICE_METADATA: Record<DeviceKey, { label: string; role: string }> = {
  rhLever:       { label: "RH Lever",       role: "Right-hand lever" },
  lhLever:       { label: "LH Lever",       role: "Left-hand lever" },
  primaryCue:    { label: "Cue 1",  role: "Primary auditory cue" },
  secondaryCue:  { label: "Cue 2",  role: "Secondary auditory cue" },
  primaryPump:   { label: "Pump 1", role: "Primary syringe pump" },
  secondaryPump: { label: "Pump 2", role: "Secondary syringe pump" },
  laser:         { label: "Laser",          role: "Optogenetic stimulus" },
  lickCircuit:   { label: "Lick Circuit",   role: "Lick detection" },
  microscope:    { label: "Microscope",     role: "Imaging synchronization" },
  slm:           { label: "SLM",           role: "Spatial light modulator timestamps" },
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

/** Single source for the paradigm defaults (ParadigmSettings seed, ConfigurationPanel dirty
 *  baseline, preset fallback). `interval` is shared by VI and Omission, where 0 is rejected by
 *  validateConfig, so the default must be non-zero. Callers that store it must spread it. */
export const PARADIGM_DEFAULTS: SessionPreset["paradigmSettings"] = {
  ratio: 1,
  step: 1,
  interval: 30000,
};

const DEFAULT_LIMIT_SETTINGS: SessionPreset["limitDefaults"] = {
  limitType: "Both",
  timeLimit: 3600,
  infusionLimit: 30,
  delay: 10,
};

export function buildPresetFromSession(name: string, session: Session): SessionPreset {
  // Both excluded keys are stripped from the persisted blob, not just testMode:
  // applying a preset spreads `hardware` back over hardwareUi, so a retained
  // externalTrigger would overwrite the session's live trigger pin.
  const { testMode: _testMode, externalTrigger: _externalTrigger, ...hardware } =
    session.hardwareUi;

  return {
    id: "user-" + crypto.randomUUID(),
    name,
    paradigm: session.paradigm ?? "fr",
    devices: buildDeviceEntries(session.hardwareUi),
    hardware,
    paradigmSettings: session.paradigmSettings ?? { ...PARADIGM_DEFAULTS },
    ...(session.pavlovianParams ? { pavlovianParams: { ...session.pavlovianParams } } : {}),
    limitDefaults: session.limitSettings ?? { ...DEFAULT_LIMIT_SETTINGS },
  };
}
