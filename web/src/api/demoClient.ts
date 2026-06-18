import { MachineApiClient } from "./client";
import * as mock from "./mock";
import type { BoardInfo, BoardType } from "../types";

/**
 * A MachineApiClient subclass that routes all calls to the mock module.
 * Used in demo mode so that `getClientForSession()` returns a client
 * that works without a real backend.
 */
export class DemoMachineApiClient extends MachineApiClient {
  constructor() {
    super("");
  }

  // --- Health ---
  probeHealth = async () =>
    ({ service: "reacher", device_id: "__local__", hostname: "demo", version: "3.0.0-beta.7", active_sessions: 0 });

  // --- Sessions ---
  listSessions = () => mock.listSessions() as ReturnType<MachineApiClient["listSessions"]>;
  createSession = (port: string, paradigm?: string) =>
    mock.createSession(port, paradigm) as ReturnType<MachineApiClient["createSession"]>;
  getSession = (id: string) => mock.getSession(id) as ReturnType<MachineApiClient["getSession"]>;
  destroySession = (id: string) => mock.destroySession(id) as ReturnType<MachineApiClient["destroySession"]>;
  resetSession = (id: string) => mock.resetSession(id) as ReturnType<MachineApiClient["resetSession"]>;

  // --- Serial ---
  listPorts = () => mock.listPorts() as ReturnType<MachineApiClient["listPorts"]>;
  connectSerial = (id: string) => mock.connectSerial(id) as ReturnType<MachineApiClient["connectSerial"]>;
  disconnectSerial = (id: string) => mock.disconnectSerial(id) as ReturnType<MachineApiClient["disconnectSerial"]>;

  // --- Firmware ---
  listBoards = () => mock.listBoards() as Promise<{ boards: BoardInfo[] }>;
  listParadigms = (board?: BoardType) => mock.listParadigms(board) as ReturnType<MachineApiClient["listParadigms"]>;
  uploadFirmware = (id: string, paradigm: string, board: BoardType = "uno") =>
    mock.uploadFirmware(id, paradigm, board) as ReturnType<MachineApiClient["uploadFirmware"]>;

  // --- Hardware ---
  sendCommand = (id: string, code: number, value?: number) =>
    mock.sendCommand(id, code, value) as ReturnType<MachineApiClient["sendCommand"]>;
  getCommands = (id: string) => mock.getCommands(id) as ReturnType<MachineApiClient["getCommands"]>;
  getConfig = (id: string) => mock.getConfig(id) as ReturnType<MachineApiClient["getConfig"]>;

  // --- Program ---
  startProgram = (id: string) => mock.startProgram(id) as ReturnType<MachineApiClient["startProgram"]>;
  stopProgram = (id: string) => mock.stopProgram(id) as ReturnType<MachineApiClient["stopProgram"]>;
  pauseProgram = (id: string) => mock.pauseProgram(id) as ReturnType<MachineApiClient["pauseProgram"]>;
  splitSegment = (id: string) => mock.splitSegment(id) as ReturnType<MachineApiClient["splitSegment"]>;
  restartProgram = (id: string) => mock.restartProgram(id) as ReturnType<MachineApiClient["restartProgram"]>;
  setLimit = (id: string, body: { type: string; time_limit?: number; infusion_limit?: number; delay?: number }) =>
    mock.setLimit(id, body) as ReturnType<MachineApiClient["setLimit"]>;

  // --- Data ---
  getBehavior = (id: string, since?: number) =>
    mock.getBehavior(id, since) as ReturnType<MachineApiClient["getBehavior"]>;
  getFrames = (id: string) => mock.getFrames(id) as ReturnType<MachineApiClient["getFrames"]>;
  exportZip = (
    id: string,
    body: {
      session_name?: string;
      notes?: string;
      infusion_count?: number;
      press_count?: number;
      trial_count?: number;
      program_start_time?: number | null;
      microscope_frame_rate?: number | null;
      microscope_frame_averaging?: number | null;
    },
  ) => mock.exportZip(id, body) as ReturnType<MachineApiClient["exportZip"]>;

  // --- Download ---
  downloadExportZip = async (_id: string, _filePath: string): Promise<void> => {
    await mock.downloadExportZip(_id, _filePath);
  };

  // --- Lifecycle ---
  shutdown = () => mock.shutdown() as ReturnType<MachineApiClient["shutdown"]>;

  // --- File ---
  setFileConfig = (id: string, body: { filename?: string; destination?: string }) =>
    mock.setFileConfig(id, body) as ReturnType<MachineApiClient["setFileConfig"]>;
}
