export type SessionState =
  | "idle"
  | "uploading"
  | "connected"
  | "running"
  | "paused"
  | "stopped";

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
  microscope: DeviceArmState;
  testMode: boolean;
}

export interface Session {
  id: string;
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
  rhLeverCounts: LeverCounts;
  lhLeverCounts: LeverCounts;
  hardwareUi: HardwareUiState;
  fileConfig: { filename: string; destination: string };
  exportState: { exporting: boolean; result: string | null; error: string | null };
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
  | { type: "upload_progress"; session_id: string; data: { percent: number; stage: string } }
  | { type: "session_state"; session_id: string; data: { state: SessionState } };
