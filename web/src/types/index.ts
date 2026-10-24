export type SessionState =
  | "idle"
  | "uploading"
  | "connected"
  | "running"
  | "paused"
  | "stopped"
  | "disconnected";  // Fix: XL-003 — Serial disconnect surfaced to frontend

// Keep in sync with reacher/src/reacher/uploader/boards.py BOARD_PROFILES
export type BoardType = "uno" | "mega";

export interface BoardInfo {
  id: BoardType;
  name: string;
}

export interface LeverCounts {
  active: number;
  timeout: number;
  inactive: number;
}

export interface DeviceArmState {
  armed: boolean;
}

export interface ContingencyConfig {
  leverFilter: "none" | "rh" | "lh";
  delay: number;
}

export interface LeverUiState extends DeviceArmState {
  timeout: number;
  /** Which presses start the timeout window: 0 = every active press (legacy
   *  default), 1 = only the press that triggers the reward chain. Sent as
   *  command 1077 (RH) / 1377 (LH). Both codes write one scheduler-wide flag in
   *  firmware — exactly like the `timeout` interval above — so the two levers
   *  are not independent and the last write wins. */
  timeoutMode: number;
}

export interface CueUiState extends DeviceArmState {
  frequency: number;
  duration: number;
  contingency: ContingencyConfig;
}

export interface PumpUiState extends DeviceArmState {
  duration: number;
  contingency: ContingencyConfig;
  /** User-entered pump flow rate (µL/s), used only to compute the volume
   *  estimate below — not sent to hardware. Software has no way to know the
   *  physical pump/tubing's actual rate; null until the user supplies one. */
  flowRateUlPerSec: number | null;
}

export interface LaserUiState extends DeviceArmState {
  frequency: number;
  duration: number;
  mode: "contingent" | "independent" | "rh_lever" | "lh_lever" | "cs_plus" | "cs_minus" | "cs_both";
  phase?: "reward" | "cue";  // Pavlovian only — which trial phase triggers laser
  contingency: "any" | "rh" | "lh" | "independent";  // operant lever routing (#67)
  onsetDelay: number;  // ms from trigger to laser onset (#67/#69)
}

export interface MicroscopeUiState extends DeviceArmState {
  frameRate: number | null;
  frameAveraging: number | null;
}

export interface SlmUiState extends DeviceArmState {
  pin: number;
  /** Bookkeeping only — records what the laser's frequency/duration should have
   *  been, so a session record survives if the laser itself misbehaves. Not
   *  tied to the LASER device's actual live state. */
  laserFrequency: number | null;
  laserDuration: number | null;
}

export interface AuxUiState extends DeviceArmState {
  /** TTL shock output. `armed` is only ever set from the firmware's level-000 line or a confirmed arm. */
  duration: number;
  onsetDelay: number;
  mode: 0 | 1;  // 0 = independent, 1 = block
  probability: number;
  blockK: number;
  blockN: number;
  seed: number;  // 0 = auto
  testFire: boolean;
  /** true after a full SET of a configured card; any field edit clears it. Arm is disabled until true. */
  configSent: boolean;
  /** Last firmware refusal, cleared by the next successful SET or by dismiss. */
  lastError?: string;
}

export interface HardwareUiState {
  rhLever: LeverUiState;
  lhLever: LeverUiState;
  primaryCue: CueUiState;
  secondaryCue: CueUiState;
  primaryPump: PumpUiState;
  secondaryPump: PumpUiState;
  laser: LaserUiState;
  lickCircuit: DeviceArmState;
  microscope: MicroscopeUiState;
  slm: SlmUiState;
  aux: AuxUiState;
  testMode: boolean;
}

/** A REACHER API instance — local or on a remote machine (e.g. Raspberry Pi). */
export interface Machine {
  /** Persistent UUID hex from the device's ~/.reacher/device_id */
  deviceId: string;
  /** User-editable display name (defaults to hostname) */
  name: string;
  /** Hostname reported by the device */
  hostname: string;
  /** Base URL of the API, e.g. "http://192.168.1.50:6229". Empty string for local. */
  url: string;
  /** True when this machine is the same origin as the frontend */
  isLocal: boolean;
  /** True when the API key has been exchanged and stored server-side */
  paired: boolean;
  /** Whether the device responded to the last health probe */
  online: boolean;
  /** ISO timestamp of the last successful health probe */
  lastSeen: string | null;
}

/** A REACHER device discovered via mDNS that has not yet been paired. */
export interface DiscoveredDevice {
  deviceId: string;
  hostname: string;
  url: string;
  paired: boolean;
  discovered: boolean;
  active_sessions: number | null;
}

export interface Session {
  id: string;
  draft: boolean;
  /** deviceId of the Machine this session belongs to */
  machineId: string;
  port: string;
  paradigm: string | null;
  board: BoardType | null;
  state: SessionState;
  name: string;
  notes: string;
  firmwareInfo: FirmwareConfig | null;
  hardwareSettings: FirmwareConfig[];
  behaviorData: BehaviorEvent[];
  frameData: number[];
  slmData: number[];
  infusionCount: number;
  pressCount: number;
  programStartTime: number | null;
  programEndTime: number | null;
  pausedTime: number;
  pauseStartTime: number | null;
  pavlovianParams: Record<number, number> | null;
  paradigmSettings: { ratio: number; step: number; interval: number; activeLever?: "rh" | "lh" } | null;
  /** `countedPumps` absent or null = Auto (the server follows the reward pump). */
  limitSettings: { limitType: string; timeLimit: number; infusionLimit: number; delay: number; countedPumps?: string[] | null } | null;
  /** Whole-session infusion count from the server (`infusion_count` WS event); null until the first one arrives. */
  serverInfusionCount: number | null;
  infusionsByPump: Record<string, number> | null;
  trialCount: number;
  csPlusCount: number;
  csMinusCount: number;
  rhLeverCounts: LeverCounts;
  lhLeverCounts: LeverCounts;
  hardwareUi: HardwareUiState;
  /** Per-component Arduino pin overrides (lowercase Component keys). Empty
   *  object means firmware defaults are in effect. */
  pinOverrides: Record<string, number>;
  /** Commands the connected firmware accepts (`GET /api/hardware/{id}/commands`),
   *  fetched once per connect by `useFirmwareCommandsSync`. Null until then, and
   *  again whenever the board goes away or the paradigm changes. */
  firmwareCommands: CommandSpec[] | null;
  fileConfig: { filename: string; destination: string };
  exportState: { exporting: boolean; result: string | null; error: string | null };
  segmentNumber: number;
  cumulativeInfusionCount: number;
  cumulativePressCount: number;
  cumulativeTrialCount: number;
  cumulativeCsPlusCount: number;
  cumulativeCsMinusCount: number;
  cumulativeShockCount: number;
  cumulativeRhLeverCounts: LeverCounts;
  cumulativeLhLeverCounts: LeverCounts;
  cumulativeElapsedTime: number;
}

export interface FirmwareConfig {
  sketch: string | null;
  version: string | null;
  baud_rate: number | null;
  desc: string | null;
  [key: string]: unknown;
}

export interface BehaviorEvent {
  device: string;
  event: string;
  start_timestamp: number;
  end_timestamp: number;
  /** Pavlovian TRIAL_START only: distinguishes CS+ from CS- trials. */
  trial_type?: "CS_PLUS" | "CS_MINUS";
}

export interface CommandSpec {
  code: number;
  name: string;
  description: string;
  payload_key: string | null;
  payload_type: string | null;
}

export type WSMessage =
  | { type: "event"; session_id: string; data: BehaviorEvent }
  | { type: "frame"; session_id: string; data: { timestamp: number } }
  | { type: "config"; session_id: string; data: FirmwareConfig }
  | { type: "log"; session_id: string; data: { level: string; message: string } }
  | { type: "error"; session_id: string; data: { level: string; device: string; desc: string; timestamp: number } }
  | { type: "upload_progress"; session_id: string; data: { percent: number; stage: string } }
  | { type: "session_state"; session_id: string; data: { state: SessionState } }
  | { type: "disconnect"; session_id: string; data: { reason: string } }  // Fix: XL-003
  | { type: "export_failed"; session_id: string; data: { reason: string } }  // Fix: F-005
  | { type: "kernel_error"; session_id: string; data: { reason: string; raw: string } }  // Fix: F-006
  | { type: "split"; session_id: string; data: { segment_number: number; export_path: string } }
  | { type: "restart"; session_id: string; data: Record<string, never> }
  | { type: "server_suspended"; session_id: string; data: { reason: string; hard_kill_in: number } }
  | { type: "server_resumed"; session_id: string; data: Record<string, never> }
  | { type: "session_orphaned"; session_id: string; data: { reason: string; hard_kill_in: number } }
  | { type: "reconnected"; session_id: string; data: { attempt: number } }
  | { type: "warning"; session_id: string; data: { message?: string; reason?: string; thread?: string; log_type?: string } }
  | { type: "infusion_count"; session_id: string; data: { counted: number; by_pump: Record<string, number>; counted_pumps: string[]; follows_reward_pump: boolean } }
  | { type: "pong"; session_id: string; data?: Record<string, never> };
