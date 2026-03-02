import type { BoardInfo, BoardType } from "../types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

// --- Sessions ---
export const listSessions = () => request<{ sessions: Array<Record<string, unknown>> }>("/sessions");
export const createSession = (port: string, paradigm?: string) =>
  request<{ session_id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ port, paradigm }),
  });
export const getSession = (id: string) => request<Record<string, unknown>>(`/sessions/${id}`);
export const destroySession = (id: string) => request(`/sessions/${id}`, { method: "DELETE" });
export const resetSession = (id: string) =>
  request(`/sessions/${id}/reset`, { method: "POST" });

// --- Serial ---
export const listPorts = () => request<{ ports: string[] }>("/serial/ports");
export const connectSerial = (id: string) =>
  request<{ status: string; port: string; detected_paradigm: string | null; detected_board: string | null }>(
    `/serial/${id}/connect`,
    { method: "POST" },
  );
export const disconnectSerial = (id: string) =>
  request(`/serial/${id}/disconnect`, { method: "POST" });

// --- Firmware ---
export const listBoards = () =>
  request<{ boards: BoardInfo[] }>("/firmware/boards");
export const listParadigms = (board?: BoardType) =>
  request<{ paradigms: string[] }>(
    `/firmware/paradigms${board ? `?board=${board}` : ""}`,
  );
export const uploadFirmware = (id: string, paradigm: string, board: BoardType = "uno") =>
  request<{ status: string; paradigm: string; board: string; firmware_info: Record<string, unknown> }>(
    `/firmware/upload/${id}`,
    {
      method: "POST",
      body: JSON.stringify({ paradigm, board }),
    },
  );

// --- Hardware ---
export const sendCommand = (id: string, code: number, value?: number) =>
  request(`/hardware/${id}/command`, {
    method: "POST",
    body: JSON.stringify({ code, value }),
  });
export const getCommands = (id: string) =>
  request<{ paradigm: string; commands: Array<Record<string, unknown>> }>(`/hardware/${id}/commands`);
export const getConfig = (id: string) =>
  request<{ firmware_info: Record<string, unknown>; hardware_settings: unknown[] }>(`/hardware/${id}/config`);

// --- Program ---
export const startProgram = (id: string) =>
  request(`/program/${id}/start`, { method: "POST" });
export const stopProgram = (id: string) =>
  request(`/program/${id}/stop`, { method: "POST" });
export const pauseProgram = (id: string) =>
  request(`/program/${id}/pause`, { method: "POST" });
export const setLimit = (id: string, body: { type: string; time_limit?: number; infusion_limit?: number; delay?: number }) =>
  request(`/program/${id}/limit`, { method: "POST", body: JSON.stringify(body) });

// --- Data ---
export const getBehavior = (id: string, since?: number) =>
  request<{ data: Array<Record<string, unknown>>; total: number }>(
    `/data/${id}/behavior${since != null ? `?since=${since}` : ""}`
  );
export const getFrames = (id: string) =>
  request<{ frames: unknown[]; count: number }>(`/data/${id}/frames`);
export const exportZip = (
  id: string,
  body: {
    session_name?: string;
    notes?: string;
    infusion_count?: number;
    press_count?: number;
    trial_count?: number;
    program_start_time?: number | null;
  }
) =>
  request<{ file_path: string; folder_path: string }>(`/file/${id}/export/zip`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// --- Lifecycle ---
export const shutdown = () => request("/lifecycle/shutdown", { method: "POST" });

// --- File ---
export const setFileConfig = (id: string, body: { filename?: string; destination?: string }) =>
  request<{ filename: string; destination: string }>(`/file/${id}/config`, { method: "POST", body: JSON.stringify(body) });
