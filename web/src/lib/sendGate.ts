// Erasable TS only: node --test imports this directly.
import type { SessionState } from "../types/index.ts";

/** True when a board is attached, so a picked value can go out at once rather than only at Start. */
export function canSendNow(state: SessionState | undefined): boolean {
  return state === "connected" || state === "running" || state === "paused" || state === "stopped";
}
