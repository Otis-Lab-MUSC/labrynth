/**
 * Desktop-mode detection for the Electron shell.
 *
 * The bridge object is set by the Electron preload script (desktop/src/preload.ts),
 * which exposes it on window.labrynthDesktop via contextBridge. When the page is
 * running in a plain browser (or the CLI-launched web UI), the bridge is absent and
 * isDesktop() returns false.
 */

/**
 * Must match desktop/src/contracts.ts (LabrynthDesktopBridge). Keep the two in sync;
 * the web build does not import from the desktop package.
 */
export interface LabrynthDesktopBridge {
  isDesktop: true;
  /** process.platform */
  platform: string;
  /** From the `--labrynth-version=<v>` argv entry, or "unknown". */
  version: string;
}

declare global {
  interface Window {
    labrynthDesktop?: LabrynthDesktopBridge;
  }
}

/** True when the page is hosted by the Electron desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && window.labrynthDesktop?.isDesktop === true;
}

/** The desktop bridge info, or null when not running in the desktop shell. */
export function desktopInfo(): LabrynthDesktopBridge | null {
  return isDesktop() ? (window.labrynthDesktop as LabrynthDesktopBridge) : null;
}
