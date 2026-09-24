import type { HardwareUiState } from "../../types";
import { isParadigm } from "../../lib/paradigm";

export interface DevicePreset {
  id: string;
  name: string;
  description: string;
  paradigms: string[] | null; // null = all paradigms
  hardware: Partial<HardwareUiState>;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // Populate with experiment-specific presets. Example shape:
  // {
  //   id: "fr-standard",
  //   name: "Standard FR",
  //   description: "RH lever + primary cue + primary pump",
  //   paradigms: ["fr", "pr"],
  //   hardware: {
  //     rhLever: { armed: true, timeout: 20000 },
  //     primaryCue: { armed: true, frequency: 2900, duration: 1000 },
  //     primaryPump: { armed: true, duration: 3000 },
  //   },
  // },
];

/** Command code for laser mode: contingent(Any) = 681, independent = 682, rh_lever = 684, lh_lever = 685, Pavlovian trial types = 691-693 */
export const LASER_MODE_COMMANDS = {
  contingent: 681, independent: 682, rh_lever: 684, lh_lever: 685,
  cs_plus: 691, cs_minus: 692, cs_both: 693,
} as const;

/** Command codes for Pavlovian laser phase selection */
export const PAV_LASER_PHASE_COMMANDS = { reward: 694, cue: 695 } as const;

export const PRESET_COMMAND_MAP: Record<string, { arm: number; disarm: number; params?: Record<string, number> }> = {
  rhLever:       { arm: 1001, disarm: 1000, params: { timeout: 1074, timeoutMode: 1077 } },
  lhLever:       { arm: 1301, disarm: 1300, params: { timeout: 1374, timeoutMode: 1377 } },
  primaryCue:    { arm: 301,  disarm: 300,  params: { frequency: 371, duration: 372, leverFilter: 378, delay: 377 } },
  secondaryCue:  { arm: 311,  disarm: 310,  params: { frequency: 381, duration: 382, leverFilter: 388 } },
  primaryPump:   { arm: 401,  disarm: 400,  params: { duration: 472,  leverFilter: 478, delay: 477 } },
  secondaryPump: { arm: 411,  disarm: 410,  params: { duration: 482,  leverFilter: 488, delay: 487 } },
  laser:         { arm: 601,  disarm: 600,  params: { frequency: 671, duration: 672, delay: 673 } },
  lickCircuit:   { arm: 501,  disarm: 500 },
  microscope:    { arm: 901,  disarm: 900 },
  slm:           { arm: 1101, disarm: 1100, params: { laserFrequency: 1102, laserDuration: 1103 } },
};

/** Paradigms (base names, `_lite` matched automatically) each param may be sent on.
 *
 * A key here means the backend does NOT declare that command for every paradigm:
 * `POST /api/hardware/{id}/command` 400s a command whose `CommandSpec.paradigms`
 * omits the session's paradigm, and in the dispatch loops below that rejection
 * throws out of the same `try` that later calls `startProgram()` — so one
 * undeclared code does not degrade the session, it prevents it from starting.
 *
 * A param-level table rather than a device-level skip: omission still needs its
 * levers armed and still accepts `timeout` (1074/1374), it is only `timeoutMode`
 * (1077/1377) that is FR/PR/VI-only. Keep in step with `paradigms=` on the
 * matching `CommandSpec` in reacher `kernel/commands.py`; reacher's
 * `tests/test_timeout_mode_e2e.py` parses this table and fails if the two drift.
 */
export const PARAM_PARADIGMS: Record<string, string[]> = {
  timeoutMode: ["fr", "pr", "vi"],
};

/** False when `paramKey` must not be dispatched on this session's paradigm. */
export function canDispatchParam(paramKey: string, paradigm?: string | null): boolean {
  const allowed = PARAM_PARADIGMS[paramKey];
  return allowed === undefined || isParadigm(paradigm, ...allowed);
}
