import type { BoardInfo, BoardType } from "../types";
import * as mock from "./mock";
import { useTutorialStore } from "../store/useTutorialStore";

const BASE = "/api";

function isDemoMode() {
  return useTutorialStore.getState().demoMode;
}

// Auth token cache — fetched once from the localhost-only endpoint
let _authToken: string | null = null;
let _authFetching: Promise<string | null> | null = null;

async function getAuthToken(): Promise<string | null> {
  if (_authToken) return _authToken;
  if (_authFetching) return _authFetching;
  _authFetching = fetch(`${BASE}/auth/token`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      _authToken = data?.token ?? null;
      return _authToken;
    })
    .catch(() => null)
    .finally(() => { _authFetching = null; });
  return _authFetching;
}

/** Expose the cached auth token for WebSocket connections. */
export async function getToken(): Promise<string | null> {
  return getAuthToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

// --- Sessions ---
export const listSessions = () =>
  isDemoMode() ? mock.listSessions() : request<{ sessions: Array<Record<string, unknown>> }>("/sessions");
export const createSession = (port: string, paradigm?: string) =>
  isDemoMode() ? mock.createSession(port, paradigm) : request<{ session_id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ port, paradigm }),
  });
export const getSession = (id: string) =>
  isDemoMode() ? mock.getSession(id) : request<Record<string, unknown>>(`/sessions/${id}`);
export const destroySession = (id: string) =>
  isDemoMode() ? mock.destroySession(id) : request(`/sessions/${id}`, { method: "DELETE" });
export const resetSession = (id: string) =>
  isDemoMode() ? mock.resetSession(id) : request(`/sessions/${id}/reset`, { method: "POST" });

// --- Serial ---
export const listPorts = () =>
  isDemoMode() ? mock.listPorts() : request<{ ports: string[] }>("/serial/ports");
export const connectSerial = (id: string) =>
  isDemoMode() ? mock.connectSerial(id) : request<{ status: string; port: string; detected_paradigm: string | null; detected_board: string | null }>(
    `/serial/${id}/connect`,
    { method: "POST" },
  );
export const disconnectSerial = (id: string) =>
  isDemoMode() ? mock.disconnectSerial(id) : request(`/serial/${id}/disconnect`, { method: "POST" });

// --- Firmware ---
export const listBoards = () =>
  isDemoMode() ? mock.listBoards() : request<{ boards: BoardInfo[] }>("/firmware/boards");
export const listParadigms = (board?: BoardType) =>
  isDemoMode() ? mock.listParadigms(board) : request<{ paradigms: string[] }>(
    `/firmware/paradigms${board ? `?board=${board}` : ""}`,
  );
export const uploadFirmware = (id: string, paradigm: string, board: BoardType = "uno") =>
  isDemoMode() ? mock.uploadFirmware(id, paradigm, board) : request<{ status: string; paradigm: string; board: string; firmware_info: Record<string, unknown> }>(
    `/firmware/upload/${id}`,
    {
      method: "POST",
      body: JSON.stringify({ paradigm, board }),
    },
  );

// --- Hardware ---
export const sendCommand = (id: string, code: number, value?: number) =>
  isDemoMode() ? mock.sendCommand(id, code, value) : request(`/hardware/${id}/command`, {
    method: "POST",
    body: JSON.stringify({ code, value }),
  });
export const getCommands = (id: string) =>
  isDemoMode() ? mock.getCommands(id) : request<{ paradigm: string; commands: Array<Record<string, unknown>> }>(`/hardware/${id}/commands`);
export const getConfig = (id: string) =>
  isDemoMode() ? mock.getConfig(id) : request<{ firmware_info: Record<string, unknown>; hardware_settings: unknown[] }>(`/hardware/${id}/config`);

// --- Program ---
export const startProgram = (id: string) =>
  isDemoMode() ? mock.startProgram(id) : request(`/program/${id}/start`, { method: "POST" });
export const stopProgram = (id: string) =>
  isDemoMode() ? mock.stopProgram(id) : request(`/program/${id}/stop`, { method: "POST" });
export const pauseProgram = (id: string) =>
  isDemoMode() ? mock.pauseProgram(id) : request(`/program/${id}/pause`, { method: "POST" });
export const setLimit = (id: string, body: { type: string; time_limit?: number; infusion_limit?: number; delay?: number }) =>
  isDemoMode() ? mock.setLimit(id, body) : request(`/program/${id}/limit`, { method: "POST", body: JSON.stringify(body) });

// --- Data ---
export const getBehavior = (id: string, since?: number) =>
  isDemoMode() ? mock.getBehavior(id, since) : request<{ data: Array<Record<string, unknown>>; total: number }>(
    `/data/${id}/behavior${since != null ? `?since=${since}` : ""}`
  );
export const getFrames = (id: string) =>
  isDemoMode() ? mock.getFrames(id) : request<{ frames: unknown[]; count: number }>(`/data/${id}/frames`);
export const exportZip = (
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
  }
) =>
  isDemoMode() ? mock.exportZip(id, body) : request<{ file_path: string; folder_path: string }>(`/file/${id}/export/zip`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// --- Lifecycle ---
export const shutdown = () =>
  isDemoMode() ? mock.shutdown() : request("/lifecycle/shutdown", { method: "POST" });

// --- File ---
export const setFileConfig = (id: string, body: { filename?: string; destination?: string }) =>
  isDemoMode() ? mock.setFileConfig(id, body) : request<{ filename: string; destination: string }>(`/file/${id}/config`, { method: "POST", body: JSON.stringify(body) });
