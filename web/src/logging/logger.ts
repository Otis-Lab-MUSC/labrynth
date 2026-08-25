/**
 * Browser-side diagnostic logger.
 *
 * Buffers structured records and ships them to the backend, which writes them
 * into the same NDJSON stream as its own records. That shared stream is what
 * lets one file describe a whole run — click through to serial byte.
 *
 * Everything here is failure-tolerant on purpose: logging must never be the
 * reason the UI breaks.
 */

import { redact } from "./redact";
import { flush as transportFlush } from "./transport";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface UIRecord {
  evt: string;
  lvl: LogLevel;
  msg?: string;
  src?: string;
  ts: number;
  session_id?: string;
  corr_id?: string;
  data?: Record<string, unknown>;
}

const MAX_BUFFER = 400;      // below the server's 500-record batch cap
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_AT = 100;

let buffer: UIRecord[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Guards against recursion. The console patch routes console.error here, and a
 * failure inside the logger that logged its own failure would spin forever.
 */
let inLogger = false;

let currentSessionId: string | undefined;

export function setActiveSession(sessionId: string | undefined): void {
  currentSessionId = sessionId;
}

/** Mint a correlation ID; the backend adopts it from the request header. */
export function newCorrId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return Math.random().toString(16).slice(2, 18);
  }
}

export function log(
  evt: string,
  data?: Record<string, unknown>,
  lvl: LogLevel = "info",
  opts?: { msg?: string; src?: string; sessionId?: string; corrId?: string }
): void {
  if (inLogger) return;
  inLogger = true;
  try {
    buffer.push({
      evt,
      lvl,
      msg: opts?.msg,
      src: opts?.src,
      ts: Date.now(),
      session_id: opts?.sessionId ?? currentSessionId,
      corr_id: opts?.corrId,
      data: data ? (redact(data) as Record<string, unknown>) : undefined,
    });
    // Drop oldest rather than grow without bound if the backend is unreachable.
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    if (buffer.length >= FLUSH_AT) void flush();
  } catch {
    /* never throw from a log call */
  } finally {
    inLogger = false;
  }
}

/** Send everything buffered. `beacon` uses keepalive so it survives unload. */
export async function flush(beacon = false): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const ok = await transportFlush(batch, beacon);
  if (!ok) {
    // Put them back so a transient outage does not lose the run, but keep the
    // newest if we are already at capacity.
    buffer = [...batch, ...buffer].slice(-MAX_BUFFER);
  }
}

export function startLogger(): void {
  if (timer !== null) return;
  timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
}

export function stopLogger(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
