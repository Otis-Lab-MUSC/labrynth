/**
 * Electron main process for the Labrynth desktop shell. Wires the window, the
 * backend supervisor, the quit flow and the browser fallback together. Module
 * signatures come from ./contracts; this file owns lifecycle wiring only.
 */

import { app, dialog, type BrowserWindow, type MessageBoxOptions } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  BROWSER_FLAG,
  DEFAULT_PORT,
  PortInUseError,
  USER_DATA_ENV,
  baseUrlFor,
  type BackendCommand,
  type BackendExit,
} from "./contracts";
import { hasActiveSession } from "./api";
import { BackendSupervisor, resolveBackendCommand, spawnBrowserMode } from "./backend";
import { createMainWindow, loadingPageUrl, showFatal } from "./window";

const RELOAD_MIN_INTERVAL_MS = 10_000;

const userDataOverride = process.env[USER_DATA_ENV];
if (userDataOverride) {
  app.setPath("userData", userDataOverride);
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  console.log(`[labrynth] invalid REACHER_PORT; using ${DEFAULT_PORT}`);
  return DEFAULT_PORT;
}

const port = parsePort(process.env.REACHER_PORT);
const baseUrl = baseUrlFor(port);
const repoRoot = path.resolve(__dirname, "..", "..");
const command: BackendCommand = resolveBackendCommand({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  repoRoot,
});
const iconCandidate = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(repoRoot, "installer", "icons", "reacher.png");
const iconPath = fs.existsSync(iconCandidate) ? iconCandidate : undefined;
const logFile = path.join(app.getPath("userData"), "logs", "backend.log");

let win: BrowserWindow | null = null;
let supervisor: BackendSupervisor | null = null;
/** A quit request is being resolved (may be showing the session dialog). */
let busy = false;
/** Committed to exit: window close and before-quit pass through. */
let quitting = false;
/** True while supervisor.start() is pending; detach() is illegal then. */
let startPending = false;
let lastRenderReload = 0;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function liveWindow(): BrowserWindow | null {
  return win !== null && !win.isDestroyed() ? win : null;
}

function finish(): void {
  quitting = true;
  liveWindow()?.destroy();
  app.quit();
}

/** Modal dialog attached to the window when one is alive, else free-floating. */
async function ask(options: MessageBoxOptions): Promise<number> {
  const parent = liveWindow();
  const result =
    parent !== null ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return result.response;
}

async function requestQuit(opts: { interactive: boolean }): Promise<void> {
  if (quitting || busy) return;
  busy = true;
  console.log(`[labrynth] quit requested (interactive=${opts.interactive})`);
  const sup = supervisor;
  try {
    if (sup !== null && !startPending && sup.mode === "spawned" && (await hasActiveSession(baseUrl))) {
      const choice = opts.interactive
        ? await ask({
            type: "warning",
            buttons: ["Keep open", "Close window, keep recording"],
            defaultId: 0,
            cancelId: 0,
            title: "Session in progress",
            message: "A session is running.",
            detail:
              "Closing will not stop the recording. The REACHER backend keeps running in the background; " +
              "open Labrynth again to return to it.",
          })
        : 1;
      if (choice === 0) {
        console.log("[labrynth] quit cancelled; session still running");
        busy = false;
        return;
      }
      console.log("[labrynth] session running; leaving backend alive");
      sup.detach();
    } else if (sup !== null) {
      console.log("[labrynth] stopping backend");
      await sup.stop();
    }
  } catch (err) {
    console.log(`[labrynth] error during shutdown: ${errorMessage(err)}`);
  }
  finish();
}

function failStartup(err: unknown): void {
  if (quitting || busy) {
    console.log(`[labrynth] startup ended during quit: ${errorMessage(err)}`);
    return;
  }
  console.log(`[labrynth] startup failed: ${errorMessage(err)}`);
  if (err instanceof PortInUseError) {
    showFatal(
      "Labrynth cannot start",
      `Port ${port} is already used by another program. Close it, or set REACHER_PORT to a free port.`,
    );
  } else {
    showFatal("Labrynth cannot start", `${errorMessage(err)}\n\nBackend log: ${logFile}`);
  }
  void requestQuit({ interactive: false });
}

async function bringUpBackend(w: BrowserWindow, sup: BackendSupervisor): Promise<void> {
  let mode: string;
  startPending = true;
  try {
    mode = await sup.start();
  } catch (err) {
    failStartup(err);
    return;
  } finally {
    startPending = false;
  }
  console.log(`[labrynth] backend ready (${mode}) on port ${port}`);
  if (quitting || liveWindow() !== w) return;
  console.log(`[labrynth] loading ${baseUrl}`);
  try {
    await w.loadURL(baseUrl);
  } catch (err) {
    console.log(`[labrynth] loading app failed: ${errorMessage(err)}`);
  }
}

async function startShell(): Promise<void> {
  console.log(`[labrynth] starting shell (port ${port}, packaged=${app.isPackaged})`);
  const w = createMainWindow({
    appOrigin: baseUrl,
    preloadPath: path.join(__dirname, "preload.js"),
    iconPath,
    appVersion: app.getVersion(),
  });
  win = w;
  w.on("closed", () => {
    win = null;
  });
  w.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    void requestQuit({ interactive: true });
  });
  w.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || w.isDestroyed()) return;
    const now = Date.now();
    if (now - lastRenderReload < RELOAD_MIN_INTERVAL_MS) {
      console.log(`[labrynth] renderer gone (${details.reason}); reload throttled`);
      return;
    }
    lastRenderReload = now;
    console.log(`[labrynth] renderer gone (${details.reason}); reloading`);
    w.reload();
  });
  void w.loadURL(loadingPageUrl()).catch(() => undefined);

  const sup = new BackendSupervisor({ port, command, logFile });
  supervisor = sup;
  sup.on("exit", (exit: BackendExit) => void handleBackendExit(exit));
  await bringUpBackend(w, sup);
}

async function handleBackendExit(exit: BackendExit): Promise<void> {
  if (quitting || exit.expected) return;
  console.log(`[labrynth] backend exited (mode=${exit.mode}, code=${exit.code}, signal=${exit.signal})`);
  if (exit.mode === "spawned" && exit.code === 0) {
    console.log("[labrynth] backend shut itself down; quitting shell");
    quitting = true;
    app.quit();
    return;
  }
  const choice = await ask({
    type: "error",
    buttons: ["Restart backend", "Quit"],
    defaultId: 0,
    cancelId: 1,
    title: "Backend stopped",
    message: "The REACHER backend stopped unexpectedly.",
    detail: `Exit code ${exit.code ?? "none"}, signal ${exit.signal ?? "none"}.\nBackend log: ${logFile}`,
  });
  if (choice === 1) {
    console.log("[labrynth] user chose quit after backend stop");
    finish();
    return;
  }
  const w = liveWindow();
  const sup = supervisor;
  if (w === null || sup === null) {
    finish();
    return;
  }
  console.log("[labrynth] restarting backend");
  void w.loadURL(loadingPageUrl()).catch(() => undefined);
  await bringUpBackend(w, sup);
}

function wireShell(): void {
  app.on("second-instance", () => {
    const w = liveWindow();
    if (w === null) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    void requestQuit({ interactive: true });
  });
  process.on("SIGINT", () => void requestQuit({ interactive: false }));
  process.on("SIGTERM", () => void requestQuit({ interactive: false }));
  app.whenReady().then(startShell).catch(failStartup);
}

if (process.argv.includes(BROWSER_FLAG)) {
  void app.whenReady().then(() => {
    const pid = spawnBrowserMode(command, port);
    console.log(`[labrynth] browser mode: backend pid ${pid ?? "none"}`);
    if (pid === null) {
      showFatal("Labrynth", "Could not start the backend in browser mode.");
    }
    app.quit();
  });
} else if (!app.requestSingleInstanceLock()) {
  console.log("[labrynth] another instance is running; exiting");
  app.quit();
} else {
  wireShell();
}
