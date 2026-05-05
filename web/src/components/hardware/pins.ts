import { useSessionStore } from "../../store/useSessionStore";
import { DEFAULT_PIN, type Component } from "./pinMeta";

/**
 * Default Arduino pins (legacy uppercase keys, kept for back-compat in UI
 * components that haven't been migrated). New code should prefer the lowercase
 * component keys defined in `pinMeta.ts`.
 */
export const HARDWARE_PINS: Record<string, string> = {
  LEVER_RH: String(DEFAULT_PIN.lever_rh),
  LEVER_LH: String(DEFAULT_PIN.lever_lh),
  CUE: String(DEFAULT_PIN.cue),
  CUE_2: String(DEFAULT_PIN.cue2),
  PUMP: String(DEFAULT_PIN.pump),
  PUMP_2: String(DEFAULT_PIN.pump2),
  LICK: String(DEFAULT_PIN.lick),
  MICROSCOPE: `2, ${DEFAULT_PIN.microscope_trigger}`,
  LASER: String(DEFAULT_PIN.laser),
};

const LEGACY_TO_COMPONENT: Record<string, Component> = {
  LEVER_RH: "lever_rh",
  LEVER_LH: "lever_lh",
  CUE: "cue",
  CUE_2: "cue2",
  PUMP: "pump",
  PUMP_2: "pump2",
  LICK: "lick",
  LASER: "laser",
  // MICROSCOPE has two pins; handled separately by the consumer.
};

/**
 * Read the currently-effective pin number for a single hardware component.
 * Prefers the per-session override map; falls back to the firmware default.
 *
 * Returns a string for direct use in JSX text (matches `HARDWARE_PINS` shape).
 */
export function useHardwarePin(sessionId: string | null | undefined, legacyKey: string): string {
  const overrides = useSessionStore((s) =>
    sessionId ? s.sessions.get(sessionId)?.pinOverrides : undefined,
  );
  const component = LEGACY_TO_COMPONENT[legacyKey];
  if (component && overrides) {
    const pin = overrides[component];
    if (pin !== undefined) return String(pin);
  }
  return HARDWARE_PINS[legacyKey] ?? "?";
}

/**
 * Read the microscope's display string ("ts, trig"). The timestamp pin is
 * fixed at INT0 = 2; only the trigger pin is remappable.
 */
export function useMicroscopePins(sessionId: string | null | undefined): string {
  const overrides = useSessionStore((s) =>
    sessionId ? s.sessions.get(sessionId)?.pinOverrides : undefined,
  );
  const trig = overrides?.microscope_trigger ?? DEFAULT_PIN.microscope_trigger;
  return `2, ${trig}`;
}
