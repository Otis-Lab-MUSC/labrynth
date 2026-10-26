import type { HardwareUiState } from "../../types";
import { isParadigm } from "../../lib/paradigm";
import { CMD } from "../../generated/commandCodes";

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
  contingent: CMD.LASER_MODE_CONTINGENT, independent: CMD.LASER_MODE_INDEPENDENT,
  rh_lever: CMD.LASER_TRIGGER_RH_ONLY, lh_lever: CMD.LASER_TRIGGER_LH_ONLY,
  cs_plus: CMD.PAV_LASER_CS_PLUS, cs_minus: CMD.PAV_LASER_CS_MINUS, cs_both: CMD.PAV_LASER_CS_BOTH,
} as const;

/** Command codes for Pavlovian laser phase selection */
export const PAV_LASER_PHASE_COMMANDS = { reward: CMD.PAV_LASER_PHASE_REWARD, cue: CMD.PAV_LASER_PHASE_CUE } as const;

export const PRESET_COMMAND_MAP: Record<string, { arm: number; disarm: number; params?: Record<string, number> }> = {
  rhLever:       { arm: CMD.LEVER_RH_ARM, disarm: CMD.LEVER_RH_DISARM, params: { timeout: CMD.LEVER_RH_SET_TIMEOUT, timeoutMode: CMD.LEVER_RH_SET_TIMEOUT_MODE } },
  lhLever:       { arm: CMD.LEVER_LH_ARM, disarm: CMD.LEVER_LH_DISARM, params: { timeout: CMD.LEVER_LH_SET_TIMEOUT, timeoutMode: CMD.LEVER_LH_SET_TIMEOUT_MODE } },
  primaryCue:    { arm: CMD.CUE_ARM,  disarm: CMD.CUE_DISARM,  params: { frequency: CMD.CUE_SET_FREQUENCY, duration: CMD.CUE_SET_DURATION, leverFilter: CMD.CUE_SET_LEVER_FILTER, delay: CMD.CUE_SET_ONSET_DELAY } },
  secondaryCue:  { arm: CMD.CUE2_ARM,  disarm: CMD.CUE2_DISARM,  params: { frequency: CMD.CUE2_SET_FREQUENCY, duration: CMD.CUE2_SET_DURATION, leverFilter: CMD.CUE2_SET_LEVER_FILTER } },
  primaryPump:   { arm: CMD.PUMP_ARM,  disarm: CMD.PUMP_DISARM,  params: { duration: CMD.PUMP_SET_DURATION,  leverFilter: CMD.PUMP_SET_LEVER_FILTER, delay: CMD.PUMP_SET_ONSET_DELAY } },
  secondaryPump: { arm: CMD.PUMP2_ARM,  disarm: CMD.PUMP2_DISARM,  params: { duration: CMD.PUMP2_SET_DURATION,  leverFilter: CMD.PUMP2_SET_LEVER_FILTER, delay: CMD.PUMP2_SET_ONSET_DELAY } },
  laser:         { arm: CMD.LASER_ARM,  disarm: CMD.LASER_DISARM,  params: { frequency: CMD.LASER_SET_FREQUENCY, duration: CMD.LASER_SET_DURATION, delay: CMD.LASER_SET_ONSET_DELAY } },
  lickCircuit:   { arm: CMD.LICK_ARM,  disarm: CMD.LICK_DISARM },
  microscope:    { arm: CMD.MICROSCOPE_ARM,  disarm: CMD.MICROSCOPE_DISARM },
  slm:           { arm: CMD.SLM_ARM, disarm: CMD.SLM_DISARM, params: { laserFrequency: CMD.SLM_SET_LASER_FREQUENCY, laserDuration: CMD.SLM_SET_LASER_DURATION } },
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
  timeoutMode: ["fr", "pr"],
};

/** Operant paradigms: the sketches that carry the reward-chain commands (221, 1080/1081, 1380/1381). */
export function isOperantParadigm(paradigm?: string | null): boolean {
  return isParadigm(paradigm, "fr", "pr", "vi", "omission");
}

export type ActiveLever = "rh" | "lh";

/** Missing (presets / sessions saved before the field existed) means RH, the firmware boot default. */
export function activeLeverOf(ps?: { activeLever?: string } | null): ActiveLever {
  return ps?.activeLever === "lh" ? "lh" : "rh";
}

const LEVER_COMMANDS = {
  rh: { active: 1081, inactive: 1080, timeout: 1074, timeoutMode: 1077, key: "rhLever" },
  lh: { active: 1381, inactive: 1380, timeout: 1374, timeoutMode: 1377, key: "lhLever" },
} as const;

/** Timeout and timeout mode are scheduler-wide in firmware (1074/1374 write one register,
 *  1077/1377 one flag), so the per-device param loops skip them and they go out once, via
 *  `leverSchedulerCommands`. */
export function isSharedLeverParam(deviceKey: string, paramKey: string): boolean {
  return (deviceKey === "rhLever" || deviceKey === "lhLever") && (paramKey === "timeout" || paramKey === "timeoutMode");
}

interface LeverTimeoutState { armed?: boolean; timeout?: number | null; timeoutMode?: number | null }

interface FilterDeviceState { armed?: boolean; contingency?: { leverFilter?: string } }
type FilterDevices = { primaryCue?: FilterDeviceState; secondaryCue?: FilterDeviceState; primaryPump?: FilterDeviceState; secondaryPump?: FilterDeviceState };

const FILTER_DEVICE_LABELS: Record<keyof FilterDevices, string> = {
  primaryCue: "Cue 1", secondaryCue: "Cue 2", primaryPump: "Pump 1", secondaryPump: "Pump 2",
};

/** Armed cue/pump devices whose lever filter targets `lever`. A lever filter (378/478 = 1|2)
 *  makes that lever reinforced in firmware, and today that is the only web route to reward LH. */
function filterTargets(devices: FilterDevices, lever: ActiveLever): string[] {
  return (Object.keys(FILTER_DEVICE_LABELS) as Array<keyof FilterDevices>)
    .filter((k) => devices[k]?.armed && devices[k]?.contingency?.leverFilter === lever)
    .map((k) => FILTER_DEVICE_LABELS[k]);
}

/** Armed devices that only fire on presses of the NON-active lever (for a UI heads-up). */
export function filterContradictions(devices: FilterDevices, active: ActiveLever): { devices: string[]; lever: ActiveLever } {
  const lever = active === "rh" ? "lh" : "rh";
  return { devices: filterTargets(devices, lever), lever };
}

/** Commands that must follow every per-device command: the reinforcement pair for the active
 *  lever (it wins over the lever-filter commands, which only ever set reinforced), then the one
 *  scheduler-wide timeout and timeout mode taken from the active lever's stored values. The other
 *  lever's inactive code is withheld when an armed device's filter targets it, so an existing
 *  filter-based "reward LH" setup keeps its LH reinforced. */
export function leverSchedulerCommands(
  paradigm: string | null | undefined,
  active: ActiveLever,
  levers: { rhLever?: LeverTimeoutState; lhLever?: LeverTimeoutState } & FilterDevices,
): Array<[number, number?]> {
  if (!isOperantParadigm(paradigm)) return [];
  const other = active === "rh" ? "lh" : "rh";
  const codes = LEVER_COMMANDS[active];
  const src = levers[codes.key];
  const out: Array<[number, number?]> = [[codes.active]];
  if (filterTargets(levers, other).length === 0) out.push([LEVER_COMMANDS[other].inactive]);
  // VI has no timeout, but the firmware boots with a 20 s post-reward lockout. Hiding the
  // control is not enough: pin it to 0 on every dispatch, armed or not, and never send a mode.
  if (isParadigm(paradigm, "vi")) {
    out.push([codes.timeout, 0]);
    return out;
  }
  // Like the per-lever loop it replaces, write timeout only when a lever is armed — an untouched
  // store default (0) must not overwrite the firmware's own default timeout.
  if (!levers.rhLever?.armed && !levers.lhLever?.armed) return out;
  if (src?.timeout != null) out.push([codes.timeout, src.timeout]);
  if (src?.timeoutMode != null && canDispatchParam("timeoutMode", paradigm)) out.push([codes.timeoutMode, src.timeoutMode]);
  return out;
}

/** 221 value for the reward chain: Pump 2 only when it is the sole armed pump. */
export function rewardPump2(pumps: { primaryPump?: { armed?: boolean }; secondaryPump?: { armed?: boolean } }): boolean {
  return !!pumps.secondaryPump?.armed && !pumps.primaryPump?.armed;
}

/** False when `paramKey` must not be dispatched on this session's paradigm. */
export function canDispatchParam(paramKey: string, paradigm?: string | null): boolean {
  const allowed = PARAM_PARADIGMS[paramKey];
  return allowed === undefined || isParadigm(paradigm, ...allowed);
}
