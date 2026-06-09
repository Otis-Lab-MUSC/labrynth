import type { BoardInfo, BoardType } from "../types";
import * as mock from "./mock";
import { useTutorialStore } from "../store/useTutorialStore";

// ---------------------------------------------------------------------------
// Session config validation types (rule-based pre-start check)
// ---------------------------------------------------------------------------

export interface ValidationWarning {
  field: string;
  message: string;
  severity: "warning" | "error";
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  suggestions: string;
}

export type ValidateConfigPayload = {
  paradigm?: string;
  paradigmSettings?: Record<string, unknown>;
  hardwareUi?: Record<string, unknown>;
  pavlovianParams?: Record<string, unknown>;
  limitSettings?: Record<string, unknown>;
};

// Fix: FE-001 — Filename validation to prevent path traversal
const UNSAFE_FILENAME_RE = /[<>:"/\\|?*\x00-\x1f]/;
const ARCHIVE_SUFFIX_RE = /\.(zip|tar\.gz|tgz|tar|gz)$/i;
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (UNSAFE_FILENAME_RE.test(trimmed)) {
    throw new Error(`Invalid filename: contains unsafe characters`);
  }
  if (trimmed.startsWith(".") || trimmed.includes("..")) {
    throw new Error(`Invalid filename: path traversal attempt`);
  }
  // Strip a trailing archive suffix so `experiment.zip` doesn't become
  // `experiment.zip.zip` once the backend appends its own `.zip`.
  return trimmed.replace(ARCHIVE_SUFFIX_RE, "");
}

function isDemoMode() {
  return useTutorialStore.getState().demoMode;
}

// ---------------------------------------------------------------------------
// MachineApiClient — one instance per REACHER API endpoint
// ---------------------------------------------------------------------------

interface HealthResponse {
  service: string;
  device_id: string;
  hostname: string;
  version: string;
  active_sessions: number;
}

export class MachineApiClient {
  /** Base URL, e.g. "http://192.168.1.50:6229". Empty string for local (same-origin). */
  readonly baseUrl: string;
  /**
   * When set, all API calls are proxied through /api/proxy/{deviceId}/... on the
   * local REACHER server.  The API key is stored server-side; the browser never
   * holds it.  Null for local machines.
   */
  readonly deviceId: string | null;
  private readonly _apiKey: string | undefined;

  // Per-instance token cache for the local / same-origin machine
  private _token: string | null = null;
  private _tokenFetching: Promise<string | null> | null = null;

  constructor(baseUrl: string, apiKey?: string, deviceId?: string) {
    this.baseUrl = baseUrl;
    this._apiKey = apiKey;
    this.deviceId = deviceId ?? null;
  }

  /** True when this client routes through the local proxy (remote machine). */
  get isRemote(): boolean {
    return this.deviceId !== null;
  }

  /** WebSocket base URL derived from this machine's base URL. */
  get wsBaseUrl(): string {
    if (!this.baseUrl) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}`;
    }
    return this.baseUrl.replace(/^https?:/, (m) => (m === "https:" ? "wss:" : "ws:"));
  }

  /** Synchronous WS token — only valid for local or legacy remote clients. */
  getWsToken(): string | undefined {
    return this._apiKey;
  }

  /**
   * Async WS token + URL for all client types.
   *
   * - Local machine: returns same-origin WS info using the auto-fetched token.
   * - Proxy client: fetches token from /api/proxy/{deviceId}/ws-token on the local server.
   * - Legacy remote (apiKey supplied directly): returns stored key + derived WS URL.
   */
  async getWsTokenAsync(): Promise<{ token: string; wsUrl: string } | null> {
    if (this.deviceId) {
      // Proxy mode: ask local server for the relay WS URL and local token
      try {
        const localToken = await this.getToken();
        const headers: Record<string, string> = {};
        if (localToken) headers["Authorization"] = `Bearer ${localToken}`;
        const res = await fetch(`/api/proxy/${this.deviceId}/ws-token`, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        // Backend returns snake_case ws_url; map to camelCase for internal use
        return { token: data.token, wsUrl: data.ws_url };
      } catch {
        return null;
      }
    }
    // Local machine or legacy remote
    const token = await this.getToken();
    if (!token) return null;
    return { token, wsUrl: this.wsBaseUrl };
  }

  private async getToken(): Promise<string | null> {
    // Legacy remote or direct-key client
    if (this._apiKey !== undefined) return this._apiKey;

    // Local machine (and proxy clients hitting the local server): auto-fetch token
    if (this._token) return this._token;
    if (this._tokenFetching) return this._tokenFetching;
    this._tokenFetching = fetch(`${this.baseUrl}/api/auth/token`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        this._token = data?.token ?? null;
        return this._token;
      })
      .catch(() => null)
      .finally(() => { this._tokenFetching = null; });
    return this._tokenFetching;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Proxy mode: route through local server's /api/proxy/{deviceId}{path}
    const url = this.deviceId
      ? `/api/proxy/${this.deviceId}/api${path}`
      : `${this.baseUrl}/api${path}`;

    const res = await fetch(url, { headers, ...init });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  }

  /** Probe /health and return the payload, or null on failure/timeout. */
  async probeHealth(): Promise<HealthResponse | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return res.json() as Promise<HealthResponse>;
    } catch {
      return null;
    }
  }

  // --- Sessions ---
  listSessions = () =>
    this.request<{ sessions: Array<Record<string, unknown>> }>("/sessions");
  createSession = (port: string, paradigm?: string) =>
    this.request<{ session_id: string }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ port, paradigm }),
    });
  getSession = (id: string) =>
    this.request<Record<string, unknown>>(`/sessions/${id}`);
  destroySession = (id: string) =>
    this.request(`/sessions/${id}`, { method: "DELETE" });
  resetSession = (id: string) =>
    this.request(`/sessions/${id}/reset`, { method: "POST" });

  // --- Serial ---
  listPorts = () =>
    this.request<{ ports: string[]; portBoards: Record<string, string | null> }>("/serial/ports");
  connectSerial = (id: string) =>
    this.request<{ status: string; port: string; detected_paradigm: string | null; detected_board: string | null }>(
      `/serial/${id}/connect`,
      { method: "POST" },
    );
  disconnectSerial = (id: string) =>
    this.request(`/serial/${id}/disconnect`, { method: "POST" });

  // --- Firmware ---
  listBoards = () =>
    this.request<{ boards: BoardInfo[] }>("/firmware/boards");
  listParadigms = (board?: BoardType) =>
    this.request<{ paradigms: string[] }>(
      `/firmware/paradigms${board ? `?board=${board}` : ""}`,
    );
  uploadFirmware = (id: string, paradigm: string, board: BoardType = "uno") =>
    this.request<{ status: string; paradigm: string; board: string; firmware_info: Record<string, unknown> }>(
      `/firmware/upload/${id}`,
      { method: "POST", body: JSON.stringify({ paradigm, board }) },
    );

  // --- Hardware ---
  sendCommand = (id: string, code: number, value?: number) =>
    this.request(`/hardware/${id}/command`, {
      method: "POST",
      body: JSON.stringify({ code, value }),
    });
  getCommands = (id: string) =>
    this.request<{ paradigm: string; commands: Array<Record<string, unknown>> }>(`/hardware/${id}/commands`);
  getConfig = (id: string) =>
    this.request<{ firmware_info: Record<string, unknown>; hardware_settings: unknown[] }>(`/hardware/${id}/config`);
  setPins = (id: string, assignments: Record<string, number>) =>
    this.request<{ applied: Record<string, number>; errors: Array<{ component: string; error: string }> }>(
      `/hardware/${id}/pins`,
      { method: "PUT", body: JSON.stringify({ assignments }) },
    );

  // --- Program ---
  startProgram = (id: string) =>
    this.request(`/program/${id}/start`, { method: "POST" });
  stopProgram = (id: string) =>
    this.request(`/program/${id}/stop`, { method: "POST" });
  pauseProgram = (id: string) =>
    this.request(`/program/${id}/pause`, { method: "POST" });
  splitSegment = (id: string) =>
    this.request(`/program/${id}/split`, { method: "POST" });
  restartProgram = (id: string) =>
    this.request(`/program/${id}/restart`, { method: "POST" });
  setLimit = (id: string, body: { type: string; time_limit?: number; infusion_limit?: number; delay?: number }) =>
    this.request(`/program/${id}/limit`, { method: "POST", body: JSON.stringify(body) });

  // --- Data ---
  getBehavior = (id: string, since?: number) =>
    this.request<{ data: Array<Record<string, unknown>>; total: number }>(
      `/data/${id}/behavior${since != null ? `?since=${since}` : ""}`,
    );
  getFrames = (id: string) =>
    this.request<{ frames: unknown[]; count: number }>(`/data/${id}/frames`);
  getSlmEvents = (id: string) =>
    this.request<{ slm: number[]; count: number }>(`/data/${id}/slm`);
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
  ) =>
    this.request<{ file_path: string; folder_path: string }>(`/file/${id}/export/zip`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  // --- Download ---
  downloadExportZip = async (id: string, filePath: string): Promise<void> => {
    const token = await this["getToken"]();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const base = this.deviceId ? `/api/proxy/${this.deviceId}` : this.baseUrl;
    const url = `${base}/api/file/${id}/export/download?path=${encodeURIComponent(filePath)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filePath.split("/").pop() || "export.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  };

  // --- Lifecycle ---
  shutdown = () =>
    this.request("/lifecycle/shutdown", { method: "POST" });

  // --- Update ---
  getUpdateInfo = () =>
    this.request<{ currentVersion: string; latestVersion: string; assetUrl: string | null; assetName: string | null }>("/update/info");
  startUpdateDownload = (body: { assetUrl: string; assetName: string }) =>
    this.request<{ status: string }>("/update/download", {
      method: "POST",
      body: JSON.stringify(body),
    });
  getUpdateStatus = () =>
    this.request<{ status: string; percent: number; local_path: string | null; error: string | null }>("/update/status");
  launchUpdate = () =>
    this.request<{ status: string }>("/update/launch", { method: "POST" });

  // --- File ---
  browseFolder = () =>
    this.request<{ path: string | null }>("/file/browse");

  setFileConfig = (id: string, body: { filename?: string; destination?: string }) => {
    if (body.filename) sanitizeFilename(body.filename);
    return this.request<{ filename: string; destination: string }>(`/file/${id}/config`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  // --- Validate ---
  validateConfig = (payload: ValidateConfigPayload): Promise<ValidationResult> =>
    this.request<ValidationResult>("/validate/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
}

// ---------------------------------------------------------------------------
// Local client singleton
// ---------------------------------------------------------------------------

let _localClient: MachineApiClient | null = null;

export function getLocalClient(): MachineApiClient {
  return (_localClient ??= new MachineApiClient(""));
}

// ---------------------------------------------------------------------------
// Backward-compatible module-level exports
// All existing call sites continue to work unchanged for the local machine.
// ---------------------------------------------------------------------------

/** Expose the local machine's cached auth token for WebSocket connections. */
export async function getToken(): Promise<string | null> {
  return getLocalClient()["getToken"]();
}

// --- Sessions ---
export const listSessions = () =>
  isDemoMode() ? mock.listSessions() : getLocalClient().listSessions();
export const createSession = (port: string, paradigm?: string) =>
  isDemoMode() ? mock.createSession(port, paradigm) : getLocalClient().createSession(port, paradigm);
export const getSession = (id: string) =>
  isDemoMode() ? mock.getSession(id) : getLocalClient().getSession(id);
export const destroySession = (id: string) =>
  isDemoMode() ? mock.destroySession(id) : getLocalClient().destroySession(id);
export const resetSession = (id: string) =>
  isDemoMode() ? mock.resetSession(id) : getLocalClient().resetSession(id);

// --- Serial ---
export const listPorts = () =>
  isDemoMode() ? mock.listPorts() : getLocalClient().listPorts();
export const connectSerial = (id: string) =>
  isDemoMode() ? mock.connectSerial(id) : getLocalClient().connectSerial(id);
export const disconnectSerial = (id: string) =>
  isDemoMode() ? mock.disconnectSerial(id) : getLocalClient().disconnectSerial(id);

// --- Firmware ---
export const listBoards = () =>
  isDemoMode() ? mock.listBoards() : getLocalClient().listBoards();
export const listParadigms = (board?: BoardType) =>
  isDemoMode() ? mock.listParadigms(board) : getLocalClient().listParadigms(board);
export const uploadFirmware = (id: string, paradigm: string, board: BoardType = "uno") =>
  isDemoMode() ? mock.uploadFirmware(id, paradigm, board) : getLocalClient().uploadFirmware(id, paradigm, board);

// --- Hardware ---
export const sendCommand = (id: string, code: number, value?: number) =>
  isDemoMode() ? mock.sendCommand(id, code, value) : getLocalClient().sendCommand(id, code, value);
export const getCommands = (id: string) =>
  isDemoMode() ? mock.getCommands(id) : getLocalClient().getCommands(id);
export const getConfig = (id: string) =>
  isDemoMode() ? mock.getConfig(id) : getLocalClient().getConfig(id);
export const setPins = (id: string, assignments: Record<string, number>) =>
  isDemoMode() ? mock.setPins(id, assignments) : getLocalClient().setPins(id, assignments);

// --- Program ---
export const startProgram = (id: string) =>
  isDemoMode() ? mock.startProgram(id) : getLocalClient().startProgram(id);
export const stopProgram = (id: string) =>
  isDemoMode() ? mock.stopProgram(id) : getLocalClient().stopProgram(id);
export const pauseProgram = (id: string) =>
  isDemoMode() ? mock.pauseProgram(id) : getLocalClient().pauseProgram(id);
export const setLimit = (id: string, body: { type: string; time_limit?: number; infusion_limit?: number; delay?: number }) =>
  isDemoMode() ? mock.setLimit(id, body) : getLocalClient().setLimit(id, body);

// --- Data ---
export const getBehavior = (id: string, since?: number) =>
  isDemoMode() ? mock.getBehavior(id, since) : getLocalClient().getBehavior(id, since);
export const getFrames = (id: string) =>
  isDemoMode() ? mock.getFrames(id) : getLocalClient().getFrames(id);
export const getSlmEvents = (id: string) =>
  getLocalClient().getSlmEvents(id);
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
  },
) =>
  isDemoMode() ? mock.exportZip(id, body) : getLocalClient().exportZip(id, body);

// --- Lifecycle ---
export const shutdown = () =>
  isDemoMode() ? mock.shutdown() : getLocalClient().shutdown();

// --- File ---
export const setFileConfig = (id: string, body: { filename?: string; destination?: string }) => {
  if (body.filename) sanitizeFilename(body.filename);
  return isDemoMode()
    ? mock.setFileConfig(id, body)
    : getLocalClient().setFileConfig(id, body);
};
