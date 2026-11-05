import type { ContingencyConfig, HardwareUiState, Session, SessionState } from "../types";
import { zeroEventCounts, zeroLeverCounts } from "../lib/sessionCounters";
import type { CumulativeCounts, EventCounts, PauseFields } from "../lib/sessionCounters";

/** States in which a board is attached and its command list stays valid ("stopped" keeps the port open). */
export const LIVE_STATES: ReadonlySet<SessionState> = new Set<SessionState>(["connected", "running", "paused", "stopped"]);

const DEFAULT_CONTINGENCY = (): ContingencyConfig => ({
  leverFilter: "none", delay: 0,
});

/** Hardware panel state with everything disarmed and zeroed. */
export const defaultHardwareUiState = (): HardwareUiState => ({
  rhLever: { armed: false, timeout: 0, timeoutMode: 0 },
  lhLever: { armed: false, timeout: 0, timeoutMode: 0 },
  primaryCue:   { armed: false, frequency: 0, duration: 0, contingency: DEFAULT_CONTINGENCY() },
  secondaryCue: { armed: false, frequency: 0, duration: 0, contingency: DEFAULT_CONTINGENCY() },
  primaryPump:  { armed: false, duration: 0, contingency: DEFAULT_CONTINGENCY(), flowRateUlPerSec: null },
  secondaryPump: { armed: false, duration: 0, contingency: DEFAULT_CONTINGENCY(), flowRateUlPerSec: null },
  laser: { armed: false, frequency: 0, duration: 0, mode: "contingent", phase: "reward", contingency: "any", onsetDelay: 0 },
  lickCircuit: { armed: false },
  microscope: { armed: false, frameRate: null, frameAveraging: null },
  slm: { armed: false, pin: 11, laserFrequency: null, laserDuration: null },
  aux: { armed: false, duration: 0, onsetDelay: 0, mode: 0, probability: 0, blockK: 0, blockN: 0, seed: 0, testFire: false, configSent: false, armPending: false },
  testMode: false,
});

/** The export panel's idle state. */
export const emptyExportState = (): Session["exportState"] => ({ exporting: false, result: null, error: null });

/** The segment's event log and the counters derived from it, all cleared. */
export const zeroEventFields = (): Pick<Session, "behaviorData"> & EventCounts => ({
  behaviorData: [],
  ...zeroEventCounts(),
});

/** Recorded data and live counters, all cleared. */
export const zeroLiveFields = (): Pick<Session, "frameData" | "slmData" | "serverInfusionCount" | "infusionsByPump" | "behaviorData"> & EventCounts => ({
  frameData: [],
  slmData: [],
  serverInfusionCount: null,
  infusionsByPump: null,
  ...zeroEventFields(),
});

/** Cumulative totals carried across splits, all cleared. */
export const zeroCumulativeFields = (): CumulativeCounts & { segmentNumber: number } => ({
  segmentNumber: 0,
  cumulativeInfusionCount: 0,
  cumulativePressCount: 0,
  cumulativeTrialCount: 0,
  cumulativeCsPlusCount: 0,
  cumulativeCsMinusCount: 0,
  cumulativeShockCount: 0,
  cumulativeRhLeverCounts: zeroLeverCounts(),
  cumulativeLhLeverCounts: zeroLeverCounts(),
  cumulativeElapsedTime: 0,
});

/** Start, end and pause timing, all cleared. */
export const zeroTimingFields = (): PauseFields => ({
  programStartTime: null,
  programEndTime: null,
  pausedTime: 0,
  pauseStartTime: null,
});

/** A new idle session; drafts have no backend counterpart yet. */
export const newSession = (id: string, port: string, paradigm: string | null, machineId: string, draft = false): Session => ({
  id,
  draft,
  machineId,
  port,
  paradigm,
  board: null,
  state: "idle",
  name: "",
  notes: "",
  firmwareInfo: null,
  hardwareSettings: [],
  pavlovianParams: null,
  paradigmSettings: null,
  limitSettings: null,
  hardwareUi: defaultHardwareUiState(),
  pinOverrides: {},
  firmwareCommands: null,
  fileConfig: { filename: "", destination: "" },
  exportState: emptyExportState(),
  ...zeroLiveFields(),
  ...zeroTimingFields(),
  ...zeroCumulativeFields(),
});
