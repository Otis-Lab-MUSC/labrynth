/**
 * Ships batched records to the local backend's ingest endpoint.
 *
 * Always the *local* server, even for records about a remote machine: the
 * remote's own backend keeps its own log, and the primary pulls it on demand.
 */

import type { UIRecord } from "./logger";

const INGEST_PATH = "/api/logs/ingest";

let tokenPromise: Promise<string | null> | null = null;
let token: string | null = null;

async function getToken(): Promise<string | null> {
  if (token) return token;
  if (tokenPromise) return tokenPromise;
  tokenPromise = fetch("/api/auth/token")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      token = d?.token ?? null;
      return token;
    })
    .catch(() => null)
    .finally(() => {
      tokenPromise = null;
    });
  return tokenPromise;
}

/**
 * POST a batch. Returns false when the caller should retain the records.
 *
 * Uses `fetch(keepalive)` rather than `navigator.sendBeacon`: the endpoint
 * requires an Authorization header, and sendBeacon cannot set one. keepalive
 * still survives page unload, within a ~64 KB budget.
 */
export async function flush(records: UIRecord[], beacon = false): Promise<boolean> {
  try {
    const auth = await getToken();
    if (!auth) return false;
    const res = await fetch(INGEST_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ records }),
      keepalive: beacon,
    });
    // 413/429 mean the server rejected this batch on purpose; retrying the
    // same payload would just loop, so drop it.
    if (res.status === 413 || res.status === 429) return true;
    return res.ok;
  } catch {
    return false;
  }
}
