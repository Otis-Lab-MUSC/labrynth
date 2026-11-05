import type { BoardType, CommandSpec, Session, SessionState, BehaviorEvent, FirmwareConfig, HardwareUiState } from "../types";

/** State and actions of the session store. */
export interface SessionStore {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  sessionOrder: string[];
  uploadProgress: Map<string, { percent: number; stage: string }>;
  startModalOpen: boolean;

  setStartModalOpen: (open: boolean) => void;
  createDraft: (machineId: string) => string;
  createSession: (machineId: string, port: string, paradigm?: string) => Promise<string>;
  destroySession: (id: string) => Promise<void>;
  reorderSession: (fromId: string, toId: string) => void;
  setActive: (id: string | null) => void;
  updateState: (id: string, state: SessionState) => void;
  pushEvent: (id: string, event: BehaviorEvent) => void;
  replaceEvents: (id: string, events: BehaviorEvent[]) => void;
  pushFrame: (id: string, timestamp: number) => void;
  setFirmwareInfo: (id: string, info: FirmwareConfig) => void;
  setUploadProgress: (id: string, percent: number, stage: string) => void;
  setPavlovianParams: (id: string, params: Record<number, number>) => void;
  setParadigmSettings: (id: string, settings: { ratio: number; step: number; interval: number; activeLever?: "rh" | "lh" }) => void;
  setLimitSettings: (id: string, settings: { limitType: string; timeLimit: number; infusionLimit: number; delay: number; countedPumps?: string[] | null }) => void;
  setServerInfusionCount: (id: string, counted: number, byPump: Record<string, number>) => void;
  setParadigm: (id: string, paradigm: string) => void;
  setBoard: (id: string, board: BoardType) => void;
  resetSessionData: (id: string) => void;
  softResetSessionData: (id: string) => void;
  setSessionName: (id: string, name: string) => void;
  setSessionNotes: (id: string, notes: string) => void;
  pushHardwareSetting: (id: string, config: FirmwareConfig) => void;
  updateHardwareUi: (id: string, updater: (prev: HardwareUiState) => Partial<HardwareUiState>) => void;
  setPinOverrides: (id: string, overrides: Record<string, number>) => void;
  setFirmwareCommands: (id: string, commands: CommandSpec[]) => void;
  setFileConfig: (id: string, config: Partial<{ filename: string; destination: string }>) => void;
  setExportState: (id: string, partial: Partial<{ exporting: boolean; result: string | null; error: string | null }>) => void;
  handleSplit: (id: string, segmentNumber: number) => void;
  handleRestart: (id: string) => void;
}
