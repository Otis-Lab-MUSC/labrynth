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

export interface LeverUiState extends DeviceArmState {
  timeout: number;
  ratio: number;
}

export interface CueUiState extends DeviceArmState {
  frequency: number;
  duration: number;
}

export interface PumpUiState extends DeviceArmState {
  duration: number;
}

export interface LaserUiState extends DeviceArmState {
  frequency: number;
  duration: number;
  mode: "contingent" | "independent" | "cs_plus" | "cs_minus" | "cs_both";
  phase?: "reward" | "cue";  // Pavlovian only — which trial phase triggers laser
}

export interface MicroscopeUiState extends DeviceArmState {
  frameRate: number | null;
  frameAveraging: number | null;
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
  infusionCount: number;
  pressCount: number;
  programStartTime: number | null;
  programEndTime: number | null;
  pausedTime: number;
  pauseStartTime: number | null;
  pavlovianParams: Record<number, number> | null;
  paradigmSettings: { ratio: number; step: number; interval: number; traceInterval: number } | null;
  limitSettings: { limitType: string; timeLimit: number; infusionLimit: number; delay: number } | null;
  trialCount: number;
  csPlusCount: number;
  csMinusCount: number;
  rhLeverCounts: LeverCounts;
  lhLeverCounts: LeverCounts;
  hardwareUi: HardwareUiState;
  fileConfig: { filename: string; destination: string };
  exportState: { exporting: boolean; result: string | null; error: string | null };
  segmentNumber: number;
  cumulativeInfusionCount: number;
  cumulativePressCount: number;
  cumulativeTrialCount: number;
  cumulativeCsPlusCount: number;
  cumulativeCsMinusCount: number;
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
  | { type: "restart"; session_id: string; data: Record<string, never> };
