/**
 * Backend process supervisor for the Labrynth desktop shell.
 *
 * Resolves the REACHER backend command (packaged binary or dev `launcher.py`),
 * then either attaches to a REACHER already listening on the port or spawns
 * one and owns its lifetime. Implements the contracts in ./contracts.
 *
 * Network helpers are private to this module on purpose (api.ts is a separate
 * module owned by another task).
 */

import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import {
  ATTACHED_MAX_FAILURES,
  ATTACHED_POLL_MS,
  BackendStartError,
  DEV_PYTHON_ENV,
  HEALTH_TIMEOUT_MS,
  PortInUseError,
  READY_POLL_MS,
  READY_TIMEOUT_MS,
  STOP_TIMEOUT_MS,
  baseUrlFor,
  type BackendCommand,
  type BackendExit,
  type BackendMode,
  type IBackendSupervisor,
  type ResolveBackendCommand,
  type SpawnBrowserMode,
  type SupervisorOptions,
} from "./contracts";

/** Resolve the command that starts the backend (packaged binary or dev launcher.py). */
export const resolveBackendCommand: ResolveBackendCommand = (opts) => {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const win = platform === "win32";
  const pathMod = win ? path.win32 : path;

  if (opts.isPackaged) {
    const dir = pathMod.join(opts.resourcesPath, "backend");
    return {
      command: pathMod.join(dir, win ? "Labrynth.exe" : "Labrynth"),
      args: [],
      cwd: dir,
    };
  }

  let command: string;
  const override = env[DEV_PYTHON_ENV];
  if (override) {
    command = override;
  } else {
    const venvPython = win
      ? pathMod.join(opts.repoRoot, ".venv", "Scripts", "python.exe")
      : pathMod.join(opts.repoRoot, ".venv", "bin", "python");
    if (fs.existsSync(venvPython)) {
      command = venvPython;
    } else {
      command = win ? "python" : "python3";
    }
  }
  return {
    command,
    args: [pathMod.join(opts.repoRoot, "launcher.py")],
    cwd: opts.repoRoot,
  };
};

/** Internal: what the startup watcher observed about the spawned child. */
interface SpawnState {
  exit: { code: number | null; signal: NodeJS.Signals | null } | null;
  error: Error | null;
}

/**
 * Owns the REACHER backend for the shell: attaches to a running one or spawns
 * and supervises a child. Emits "exit" (BackendExit) once per backend lifetime.
 *
 * `testing` is for tests only (main.ts does not pass it):
 *   - attachedPollMs: override ATTACHED_POLL_MS for attached-mode health polls.
 */
export class BackendSupervisor extends EventEmitter implements IBackendSupervisor {
  readonly port: number;
  readonly baseUrl: string;

  private readonly opts: SupervisorOptions;
  private readonly attachedPollMs: number;
  private currentMode: BackendMode | null = null;
  private child: ChildProcess | null = null;
  private stopRequested = false;
  private abortStart = false;
  private startPromise: Promise<BackendMode> | null = null;
  private attachedTimer: NodeJS.Timeout | null = null;
  private attachedFailures = 0;
  private attachedPolling = false;

  /** @param opts supervisor options; @param testing optional test-only overrides. */
  constructor(opts: SupervisorOptions, testing?: { attachedPollMs?: number }) {
    super();
    this.opts = opts;
    this.port = opts.port;
    this.baseUrl = baseUrlFor(opts.port);
    this.attachedPollMs = testing?.attachedPollMs ?? ATTACHED_POLL_MS;
  }

  /** "spawned" | "attached" while supervising, otherwise null. */
  get mode(): BackendMode | null {
    return this.currentMode;
  }

  /** PID of the spawned child (null when attached, detached, or stopped). */
  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  /**
   * Attach to a REACHER already on the port, or spawn one. Concurrent calls share
   * one promise; calling while already started returns the current mode.
   * Rejects with PortInUseError (foreign listener) or BackendStartError (spawn failed).
   */
  start(): Promise<BackendMode> {
    if (this.currentMode !== null) return Promise.resolve(this.currentMode);
    if (this.startPromise !== null) return this.startPromise;
    this.abortStart = false;
    const attempt = this.beginStart().finally(() => {
      this.startPromise = null;
    });
    this.startPromise = attempt;
    return attempt;
  }

  /**
   * Spawned: SIGINT, wait up to timeoutMs, then SIGKILL; resolves after exit.
   * Attached: stops polling only; never touches the backend. Idempotent.
   * If start() is still in progress, cancels it first.
   */
  async stop(timeoutMs: number = STOP_TIMEOUT_MS): Promise<void> {
    if (this.startPromise !== null) {
      this.abortStart = true;
      await this.startPromise.catch(() => undefined);
    }
    const child = this.child;
    if (this.currentMode === "attached" || child === null) {
      this.clearAttachedTimer();
      this.currentMode = null;
      return;
    }
    this.stopRequested = true;
    const exited = waitForChildExit(child);
    child.kill("SIGINT");
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      child.kill("SIGKILL");
      await exited;
    }
  }

  /**
   * Forget the backend without stopping it: stop polling, unref and strip listeners
   * from the child. Mode becomes null and no "exit" is emitted. Not supported while
   * start() is still pending.
   */
  detach(): void {
    this.clearAttachedTimer();
    const child = this.child;
    if (child !== null) {
      child.removeAllListeners();
      // Keep a no-op error listener so a late "error" cannot crash the shell.
      child.on("error", () => undefined);
      child.unref();
      this.child = null;
    }
    this.currentMode = null;
    this.stopRequested = false;
  }

  private async beginStart(): Promise<BackendMode> {
    if (await isReacherAt(this.baseUrl)) {
      this.enterAttached();
      return "attached";
    }
    if (await tcpProbe(this.port)) {
      throw new PortInUseError(this.port);
    }
    await this.spawnAndWait();
    return "spawned";
  }

  private enterAttached(): void {
    this.currentMode = "attached";
    this.attachedFailures = 0;
    this.attachedTimer = setInterval(() => {
      void this.pollAttached();
    }, this.attachedPollMs);
  }

  private async pollAttached(): Promise<void> {
    if (this.currentMode !== "attached" || this.attachedPolling) return;
    this.attachedPolling = true;
    try {
      const ok = await isReacherAt(this.baseUrl);
      if (this.currentMode !== "attached") return;
      if (ok) {
        this.attachedFailures = 0;
        return;
      }
      this.attachedFailures += 1;
      if (this.attachedFailures >= ATTACHED_MAX_FAILURES) {
        this.clearAttachedTimer();
        this.currentMode = null;
        this.emit("exit", { mode: "attached", code: null, signal: null, expected: false } satisfies BackendExit);
      }
    } finally {
      this.attachedPolling = false;
    }
  }

  private clearAttachedTimer(): void {
    if (this.attachedTimer !== null) {
      clearInterval(this.attachedTimer);
      this.attachedTimer = null;
    }
  }

  private async spawnAndWait(): Promise<void> {
    const { command, logFile } = this.opts;
    const timeoutMs = this.opts.readyTimeoutMs ?? READY_TIMEOUT_MS;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.opts.env,
      REACHER_NO_BROWSER: "1",
      REACHER_PORT: String(this.port),
    };

    let stdio: StdioOptions = "ignore";
    let fd: number | null = null;
    if (logFile !== undefined) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      // 0600: the backend prints its API key to stdout at startup.
      fd = fs.openSync(logFile, "a", 0o600);
      stdio = ["ignore", fd, fd];
    }

    const state: SpawnState = { exit: null, error: null };
    let child: ChildProcess;
    try {
      child = spawn(command.command, command.args, { cwd: command.cwd, env, stdio });
    } catch (err) {
      throw new BackendStartError(`Failed to spawn backend: ${errorMessage(err)}`, logFile);
    } finally {
      // The child holds its own copy of the fd; close the parent's copy.
      if (fd !== null) fs.closeSync(fd);
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      state.exit = { code, signal };
    };
    const onError = (err: Error): void => {
      state.error = err;
    };
    child.on("exit", onExit);
    child.on("error", onError);
    this.child = child;

    try {
      await this.waitUntilReady(state, timeoutMs);
    } catch (err) {
      this.child = null;
      await killChild(child);
      throw err;
    }

    // Swap the startup watcher for the lifetime watcher. No I/O callback can run
    // between the readiness check above and this line (only microtasks), so the
    // child cannot have exited unnoticed.
    child.removeListener("exit", onExit);
    child.on("exit", (code, signal) => this.handleSpawnedExit(child, code, signal));
    this.currentMode = "spawned";
  }

  private async waitUntilReady(state: SpawnState, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (state.exit !== null || state.error !== null) {
        throw startupFailure(state, this.opts.logFile);
      }
      if (this.abortStart) {
        throw new BackendStartError("Backend start was cancelled by stop()", this.opts.logFile);
      }
      if (await isReacherAt(this.baseUrl)) {
        if (state.exit === null && state.error === null) return;
        continue; // child died while probing; the top of the loop reports it
      }
      if (Date.now() >= deadline) {
        throw new BackendStartError(`Backend did not become ready within ${timeoutMs} ms`, this.opts.logFile);
      }
      await sleep(READY_POLL_MS);
    }
  }

  private handleSpawnedExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): void {
    if (this.child !== child) return;
    const expected = this.stopRequested;
    this.child = null;
    this.currentMode = null;
    this.stopRequested = false;
    this.emit("exit", { mode: "spawned", code, signal, expected } satisfies BackendExit);
  }
}

/**
 * Launch the backend detached with the system browser enabled (REACHER_NO_BROWSER
 * removed) and REACHER_PORT set. The child is unref'd and its stdio ignored.
 * Returns the pid, or null if the spawn failed.
 */
export const spawnBrowserMode: SpawnBrowserMode = (command: BackendCommand, port, env) => {
  try {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env, REACHER_PORT: String(port) };
    delete childEnv.REACHER_NO_BROWSER;
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: childEnv,
      detached: true,
      stdio: "ignore",
    });
    // Async spawn failures arrive as "error"; swallow them so the shell does not crash.
    child.on("error", () => undefined);
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// private helpers
// ---------------------------------------------------------------------------

/** GET <base>/health; returns the JSON object on HTTP 200, else null. Never throws. */
async function fetchHealthBody(baseUrl: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (res.status !== 200) {
      await res.body?.cancel();
      return null;
    }
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True only when /health answers 200 with service === "reacher". */
async function isReacherAt(baseUrl: string, timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const body = await fetchHealthBody(baseUrl, timeoutMs);
  return body !== null && body.service === "reacher";
}

/** True when something accepts a TCP connection on 127.0.0.1:port (1000 ms cap). */
function tcpProbe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (listening: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.on("error", () => finish(false));
  });
}

/** Resolves when the child has exited (immediately if it already has or never spawned). */
function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
  });
}

/** SIGKILL the child (no-op if dead) and wait for it to exit. */
async function killChild(child: ChildProcess): Promise<void> {
  const exited = waitForChildExit(child);
  child.kill("SIGKILL");
  await exited;
}

function startupFailure(state: SpawnState, logFile: string | undefined): BackendStartError {
  if (state.exit !== null) {
    return new BackendStartError(
      `Backend exited during startup (code ${state.exit.code}, signal ${state.exit.signal})`,
      logFile,
    );
  }
  return new BackendStartError(
    `Backend failed to start: ${state.error?.message ?? "unknown error"}`,
    logFile,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
