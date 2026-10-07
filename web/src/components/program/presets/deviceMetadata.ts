import type { HardwareUiState } from "../../../types";
import type { Session } from "../../../types";
import type { SessionPreset, PresetDeviceEntry } from "./types";
import { PRESET_VERSION } from "./types";

/**
 * HardwareUiState keys that are deliberately NOT part of a session preset.
 *
 * `testMode` is transient session state.
 *
 * Exported so a cross-repo device-parity check could distinguish an intentional
 * omission from drift. No such consumer exists today — the reacher-side check
 * that read this lived in an MCP implementation that was discarded in favour of
 * a different upstream design. It stays exported because it is still the source
 * of `DeviceKey` below, so the exclusion is enforced by the compiler here even
 * with nothing reading it from outside.
 */
export const PRESET_EXCLUDED_DEVICE_KEYS = ["testMode"] as const;

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
  activeLever: "rh",
};

/** What LimitConfig shows for a session with no stored limits — Pavlovian has no Time/Both. */
export function defaultLimitSettings(paradigm?: string | null): SessionPreset["limitDefaults"] {
  return { limitType: paradigm === "pavlovian" ? "Trials" : "Time", timeLimit: 3600, infusionLimit: 30, delay: 10 };
}

/** `limits` is LimitConfig's on-screen state: it only reaches the store on "Set Limits", so a
 *  preset saved without it would silently drop limits the user can see but has not Set. */
export function buildPresetFromSession(
  name: string,
  session: Session,
  limits?: SessionPreset["limitDefaults"] | null,
): SessionPreset {
  const { testMode: _testMode, ...hardware } = session.hardwareUi;
  const pinOverrides = { ...session.pinOverrides };

  return {
    id: "user-" + crypto.randomUUID(),
    version: PRESET_VERSION,
    name,
    paradigm: session.paradigm ?? "fr",
    devices: buildDeviceEntries(session.hardwareUi),
    hardware,
    paradigmSettings: session.paradigmSettings ?? { ...PARADIGM_DEFAULTS },
    ...(session.pavlovianParams ? { pavlovianParams: { ...session.pavlovianParams } } : {}),
    limitDefaults: limits ?? session.limitSettings ?? defaultLimitSettings(session.paradigm),
    pinOverrides,
  };
}
