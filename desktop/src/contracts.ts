/**
 * Frozen contracts for the Labrynth desktop shell.
 *
 * Every module in src/ implements the signatures declared here, and main.ts
 * wires them together. Do not change this file from a module task: if a
 * signature is wrong, say so in your findings instead.
 *
 * Runtime model
 *   Electron main process = app entry. It owns the REACHER backend (a Python
 *   process: `python launcher.py` in dev, the PyInstaller `Labrynth` binary
 *   when packaged) as a child process, then loads http://localhost:<port> in a
 *   BrowserWindow. Same origin as the browser build, so the frontend's token
 *   flow (GET /api/auth/token with `X-Reacher-App: 1`) and CORS are unchanged.
 *
 * Backend facts this shell relies on (reacher >= 3.4.0b6)
 *   GET  /health          -> {"status":"ok","service":"reacher","device_id":"..."}  (no auth)
 *   GET  /api/auth/token  -> {"token":"..."}  needs header X-Reacher-App: 1, loopback peer
 *   GET  /api/sessions    -> {"sessions":[{session_id, port, paradigm, board, state}]}  Bearer auth
 *   REACHER_NO_BROWSER=1  -> backend never opens a system browser
 *   REACHER_PORT=<n>      -> backend listens on n (default 6229)
 *   SIGINT                -> uvicorn graceful shutdown (lifespan destroys sessions), exit code 0
 *   The backend may also exit on its own with code 0 (idle watchdog, in-app updater).
 */

import type { BrowserWindow } from "electron";
import type { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PORT = 6229;
/** Per-request timeout for /health probes. */
export const HEALTH_TIMEOUT_MS = 1500;
/** How long start() waits for a spawned backend to answer /health. */
export const READY_TIMEOUT_MS = 30_000;
/** Interval between /health polls while waiting for readiness. */
export const READY_POLL_MS = 250;
/** stop(): wait this long after SIGINT before SIGKILL. */
export const STOP_TIMEOUT_MS = 10_000;
/** Attached mode: poll /health this often to notice the backend going away. */
export const ATTACHED_POLL_MS = 5_000;
/** Attached mode: this many consecutive failed polls = backend lost. */
export const ATTACHED_MAX_FAILURES = 3;
/** Session states during which closing must not stop the backend. */
export const ACTIVE_SESSION_STATES = ["running", "paused", "uploading"] as const;
/** Key the preload exposes on `window`. Preload must inline this string (sandboxed preload cannot require local modules). */
export const BRIDGE_KEY = "labrynthDesktop";
/** Command-line flag: launch the backend in browser mode and exit the shell. */
export const BROWSER_FLAG = "--browser";
/** Env var: override Electron's userData dir (tests isolate with it). */
export const USER_DATA_ENV = "LABRYNTH_USER_DATA";
/** Env var: python interpreter for dev mode. */
export const DEV_PYTHON_ENV = "LABRYNTH_PYTHON";

export function baseUrlFor(port: number): string {
  return `http://localhost:${port}`;
}

// ---------------------------------------------------------------------------
// api.ts — backend HTTP helpers. Use Node's global fetch + AbortController.
// None of these throw: network/HTTP/parse failures return null/false/[].
// ---------------------------------------------------------------------------

export interface HealthInfo {
  status: string;
  service: string;
  device_id?: string;
}

export interface SessionSummary {
  session_id: string;
  port: string;
  paradigm: string | null;
  board?: string | null;
  state: string;
}

/** GET <base>/health. Returns parsed JSON when HTTP 200 and JSON-object body, else null. */
export type ProbeHealth = (baseUrl: string, timeoutMs?: number) => Promise<HealthInfo | null>;
/** True only when /health answers with service === "reacher". */
export type IsReacherBackend = (baseUrl: string, timeoutMs?: number) => Promise<boolean>;
/** GET <base>/api/auth/token with header `X-Reacher-App: 1`. Returns the token or null. */
export type FetchToken = (baseUrl: string) => Promise<string | null>;
/** Token + GET <base>/api/sessions with `Authorization: Bearer <token>`. Returns [] on any failure. */
export type ListSessions = (baseUrl: string) => Promise<SessionSummary[]>;
/** True when any session state is in ACTIVE_SESSION_STATES. False on any failure. */
export type HasActiveSession = (baseUrl: string) => Promise<boolean>;

// ---------------------------------------------------------------------------
// backend.ts — backend process resolution and supervision
// ---------------------------------------------------------------------------

export interface BackendCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface ResolveBackendOptions {
  isPackaged: boolean;
  /** Electron's process.resourcesPath (packaged mode). */
  resourcesPath: string;
  /** labrynth repo root (dev mode): the directory holding launcher.py. */
  repoRoot: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

/**
 * Packaged: { command: <resourcesPath>/backend/Labrynth[.exe on win32], args: [], cwd: <resourcesPath>/backend }.
 * Dev: command = env.LABRYNTH_PYTHON, else <repoRoot>/.venv/bin/python (Scripts\python.exe on win32) if it exists,
 *      else "python3" ("python" on win32); args = [<repoRoot>/launcher.py]; cwd = repoRoot.
 */
export type ResolveBackendCommand = (opts: ResolveBackendOptions) => BackendCommand;

export type BackendMode = "spawned" | "attached";

export interface BackendExit {
  /** Mode the supervisor was in when the backend went away. */
  mode: BackendMode;
  /** Child exit code (spawned mode) or null. */
  code: number | null;
  /** Child termination signal (spawned mode) or null. */
  signal: NodeJS.Signals | null;
  /** True when the exit was caused by stop(). */
  expected: boolean;
}

export interface SupervisorOptions {
  port: number;
  command: BackendCommand;
  /** Extra env for the child, merged over process.env. The supervisor always sets REACHER_NO_BROWSER=1 and REACHER_PORT. */
  env?: NodeJS.ProcessEnv;
  /** Append child stdout+stderr here (parent dirs created). Omit = discard. */
  logFile?: string;
  readyTimeoutMs?: number;
}

/** Thrown by start() when the port answers but is not a REACHER backend, or is bound by a non-HTTP listener. */
export class PortInUseError extends Error {
  constructor(public readonly port: number) {
    super(`Port ${port} is in use by another program`);
    this.name = "PortInUseError";
  }
}

/** Thrown by start() when a spawned backend does not answer /health within readyTimeoutMs, or exits during startup. */
export class BackendStartError extends Error {
  constructor(message: string, public readonly logFile?: string) {
    super(message);
    this.name = "BackendStartError";
  }
}

/**
 * start():
 *   1. If isReacherBackend(baseUrl) -> mode "attached"; begin attached health polling; resolve "attached".
 *   2. Else if anything is listening on 127.0.0.1:<port> (TCP connect succeeds) -> throw PortInUseError.
 *   3. Else spawn command with env {...process.env, ...opts.env, REACHER_NO_BROWSER: "1", REACHER_PORT: String(port)},
 *      stdio piped to logFile; poll /health every READY_POLL_MS until ready -> mode "spawned"; resolve "spawned".
 *      If the child exits first or the timeout passes -> kill it (if alive) and throw BackendStartError.
 *   Calling start() while already started is a no-op returning the current mode.
 * stop(timeoutMs = STOP_TIMEOUT_MS):
 *   Spawned: SIGINT the child, wait for exit up to timeoutMs, then SIGKILL; resolves after the child exited.
 *   Attached: never touches the backend; just stops polling. Idempotent. After stop(), mode is null.
 * detach(): forget the child/attached backend without stopping it (stop polling, unref, remove listeners
 *   from the child). Used for "close window, keep recording". After detach(), mode is null and no "exit" is emitted.
 * Events: "exit" (BackendExit) once per backend lifetime, when
 *   spawned: the child exits for any reason (expected = stop() was called);
 *   attached: ATTACHED_MAX_FAILURES consecutive failed /health polls (code/signal null, expected false).
 */
export interface IBackendSupervisor extends EventEmitter {
  readonly port: number;
  readonly baseUrl: string;
  readonly mode: BackendMode | null;
  readonly pid: number | null;
  start(): Promise<BackendMode>;
  stop(timeoutMs?: number): Promise<void>;
  detach(): void;
  on(event: "exit", listener: (exit: BackendExit) => void): this;
}

/**
 * Browser fallback: spawn the backend detached (own process group, stdio ignored, unref'd) WITHOUT
 * REACHER_NO_BROWSER so it opens the system browser itself, with REACHER_PORT set. Returns the pid
 * (or null if spawn failed). The shell quits right after.
 */
export type SpawnBrowserMode = (command: BackendCommand, port: number, env?: NodeJS.ProcessEnv) => number | null;

// ---------------------------------------------------------------------------
// window.ts — BrowserWindow factory and policies
// ---------------------------------------------------------------------------

export interface MainWindowOptions {
  /** App origin, e.g. http://localhost:6229 — the only origin the window may navigate within. */
  appOrigin: string;
  /** Absolute path to build/preload.js. */
  preloadPath: string;
  iconPath?: string;
  /** Passed to the preload via webPreferences.additionalArguments as `--labrynth-version=<v>`. */
  appVersion: string;
}

/**
 * Creates the window (1400x900, min 1024x700, title "Labrynth", backgroundColor "#0a0a0a",
 * autoHideMenuBar true, show: false then show on ready-to-show) with webPreferences
 * { contextIsolation: true, sandbox: true, nodeIntegration: false, preload, additionalArguments }.
 * Policies installed on webContents:
 *   - setWindowOpenHandler: http/https URLs -> shell.openExternal(url); always { action: "deny" }.
 *   - will-navigate: allow same-origin as appOrigin; otherwise preventDefault and, for http/https, shell.openExternal.
 *   - will-prevent-unload: event.preventDefault() (ignore the page's beforeunload veto; the main process owns close).
 * Does NOT load any URL; the caller loads loadingPageUrl() then appOrigin.
 */
export type CreateMainWindow = (opts: MainWindowOptions) => BrowserWindow;
/** A data: URL for a minimal dark "Starting Labrynth…" page (inline HTML/CSS, no scripts). */
export type LoadingPageUrl = () => string;
/** Synchronous modal error (dialog.showErrorBox). */
export type ShowFatal = (title: string, detail: string) => void;

// ---------------------------------------------------------------------------
// preload.ts — exposes exactly this object on window[BRIDGE_KEY] via contextBridge
// ---------------------------------------------------------------------------

export interface LabrynthDesktopBridge {
  isDesktop: true;
  /** process.platform */
  platform: string;
  /** From the `--labrynth-version=<v>` argv entry, or "unknown". */
  version: string;
}
