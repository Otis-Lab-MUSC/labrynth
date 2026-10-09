/**
 * BrowserWindow factory and navigation policies for the Labrynth desktop shell.
 * Signatures are frozen in ./contracts.ts (window.ts section).
 */

import { BrowserWindow, dialog, shell } from "electron";
import type { CreateMainWindow, LoadingPageUrl, ShowFatal } from "./contracts";

/** True when `url` parses and has the same origin (scheme + host + port) as `appOrigin`. */
export function isSameOrigin(url: string, appOrigin: string): boolean {
  try {
    return new URL(url).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

/** Hand off to the system browser, but only for http/https. Anything else (file:, javascript:, data:, ...) is ignored. */
function openIfWebUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  shell.openExternal(parsed.href).catch(() => undefined);
}

export const createMainWindow: CreateMainWindow = (opts) => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Labrynth",
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    show: false,
    ...(opts.iconPath ? { icon: opts.iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: opts.preloadPath,
      additionalArguments: [`--labrynth-version=${opts.appVersion}`],
    },
  });

  // Avoid a white flash: reveal only once the first frame is painted.
  win.once("ready-to-show", () => win.show());

  const wc = win.webContents;

  // Never open new windows in-app; web links go to the system browser.
  wc.setWindowOpenHandler(({ url }) => {
    openIfWebUrl(url);
    return { action: "deny" };
  });

  // Keep the window on the app origin. Anything else is blocked and, if http(s), opened externally.
  // (Programmatic loadURL calls, including the loading page and appOrigin, do not emit will-navigate.)
  wc.on("will-navigate", (event, url) => {
    if (isSameOrigin(url, opts.appOrigin)) return;
    event.preventDefault();
    openIfWebUrl(url);
  });

  // The frontend may register a beforeunload veto (e.g. unsaved-state prompts). The main process owns
  // close and shutdown, so ignore the veto and let the window close.
  wc.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });

  return win;
};

// Inline HTML, no scripts, no external resources. The CSP meta forbids everything except inline styles.
const LOADING_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Labrynth</title>
<style>
  html, body { margin: 0; height: 100%; background: #0a0a0a; color: #d4d4d4; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center;
         font-family: system-ui, sans-serif; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 500; }
  p { margin: 0; font-size: 13px; color: #8a8a8a; }
</style>
</head>
<body>
<h1>Starting Labrynth…</h1>
<p>Waiting for the REACHER backend</p>
</body>
</html>`;

export const loadingPageUrl: LoadingPageUrl = () =>
  "data:text/html;charset=utf-8," + encodeURIComponent(LOADING_HTML);

export const showFatal: ShowFatal = (title, detail) => {
  dialog.showErrorBox(title, detail);
};
