export type SessionState =
  | "idle"
  | "uploading"
  | "connected"
  | "running"
  | "paused"
  | "stopped";

export interface LeverCounts {
  active: number;
  timeout: number;
  inactive: number;
}

export interface Session {
  id: string;
  port: string;
  paradigm: string | null;
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
