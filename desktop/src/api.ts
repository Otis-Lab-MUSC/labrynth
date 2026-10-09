/**
 * Backend HTTP helpers for the Labrynth desktop shell.
 *
 * Uses Node's global fetch with an AbortController timeout on every request.
 * Nothing here throws: network errors, timeouts, non-2xx statuses, invalid JSON
 * and unexpected JSON shapes all resolve to null / false / [].
 */

import {
  ACTIVE_SESSION_STATES,
  HEALTH_TIMEOUT_MS,
  type FetchToken,
  type HasActiveSession,
  type HealthInfo,
  type IsReacherBackend,
  type ListSessions,
  type ProbeHealth,
  type SessionSummary,
} from "./contracts";

/** Timeout for every request other than /health probes. */
const REQUEST_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * GET a URL and return its parsed JSON body, or undefined on any failure
 * (network error, abort/timeout, non-2xx status, invalid JSON).
 */
async function getJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return undefined;
    }
    return await res.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** GET <base>/health. Returns the parsed object when it has string `status` and `service`, else null. */
export const probeHealth: ProbeHealth = async (
  baseUrl: string,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<HealthInfo | null> => {
  const body = await getJson(`${baseUrl}/health`, {}, timeoutMs);
  if (!isRecord(body)) return null;
  if (typeof body.status !== "string" || typeof body.service !== "string") return null;
  return body as unknown as HealthInfo;
};

/** True only when /health answers with service === "reacher". */
export const isReacherBackend: IsReacherBackend = async (
  baseUrl: string,
  timeoutMs?: number,
): Promise<boolean> => {
  const health = await probeHealth(baseUrl, timeoutMs);
  return health?.service === "reacher";
};

/** GET <base>/api/auth/token with header `X-Reacher-App: 1`. Returns the non-empty token or null. */
export const fetchToken: FetchToken = async (baseUrl: string): Promise<string | null> => {
  const body = await getJson(
    `${baseUrl}/api/auth/token`,
    { "X-Reacher-App": "1" },
    REQUEST_TIMEOUT_MS,
  );
  if (!isRecord(body)) return null;
  if (typeof body.token !== "string" || body.token === "") return null;
  return body.token;
};

/** Token + GET <base>/api/sessions. The session array, or null when any step fails. */
async function fetchSessions(baseUrl: string): Promise<unknown[] | null> {
  const token = await fetchToken(baseUrl);
  if (token === null) return null;
  const body = await getJson(
    `${baseUrl}/api/sessions`,
    { Authorization: "Bearer " + token },
    REQUEST_TIMEOUT_MS,
  );
  if (!isRecord(body) || !Array.isArray(body.sessions)) return null;
  return body.sessions;
}

/** Fetches a token, then GET <base>/api/sessions with Bearer auth. Returns [] on any failure. */
export const listSessions: ListSessions = async (baseUrl: string): Promise<SessionSummary[]> => {
  return ((await fetchSessions(baseUrl)) ?? []) as SessionSummary[];
};

/**
 * True when any session's state is in ACTIVE_SESSION_STATES, false when none is, null when the
 * check failed. null is deliberately distinct from false so a failed check never reads as idle.
 */
export const hasActiveSession: HasActiveSession = async (baseUrl: string): Promise<boolean | null> => {
  const sessions = await fetchSessions(baseUrl);
  if (sessions === null) return null;
  const active: readonly string[] = ACTIVE_SESSION_STATES;
  return sessions.some(
    (s) => isRecord(s) && typeof s.state === "string" && active.includes(s.state),
  );
};
