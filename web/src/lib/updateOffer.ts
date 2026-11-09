/** Pure logic for the in-app update banner: what the backend reports, and what the UI does with it. */

export type ApplyMode = "restart" | "manual";
export type UpdateState = "idle" | "downloading" | "ready" | "launching" | "error";

export interface UpdateOffer {
  currentVersion: string;
  latestVersion: string;
  applyMode: ApplyMode;
}

export interface UpdateStatusPayload {
  status: string;
  percent: number;
  error: string | null;
}

export interface UpdateProgress {
  state: UpdateState;
  percent: number;
  error: string | null;
}

const PERCENT_MIN = 0;
const PERCENT_MAX = 100;
const FALLBACK_ERROR = "Update failed";
const UPDATE_STATES: readonly UpdateState[] = ["idle", "downloading", "ready", "launching", "error"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The backend decides whether a release is newer; the client only checks the reply is usable. */
export function parseUpdateInfo(raw: unknown): UpdateOffer | null {
  if (!isRecord(raw) || raw.updateAvailable !== true) return null;
  const currentVersion = asText(raw.currentVersion);
  const latestVersion = asText(raw.latestVersion);
  if (currentVersion === null || latestVersion === null || asText(raw.assetUrl) === null) return null;
  const applyMode: ApplyMode = raw.applyMode === "restart" ? "restart" : "manual";
  return { currentVersion, latestVersion, applyMode };
}

export function canInstallInPlace(offer: UpdateOffer): boolean {
  return offer.applyMode === "restart";
}

export function encodeDismissal(offer: UpdateOffer): string {
  return JSON.stringify({ dismissed: offer.latestVersion, asOf: offer.currentVersion });
}

export function isOfferDismissed(offer: UpdateOffer, stored: string | null): boolean {
  if (!stored) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  return parsed.dismissed === offer.latestVersion && parsed.asOf === offer.currentVersion;
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return PERCENT_MIN;
  return Math.min(PERCENT_MAX, Math.max(PERCENT_MIN, percent));
}

export function describeStatus(payload: UpdateStatusPayload): UpdateProgress {
  const state = UPDATE_STATES.find((candidate) => candidate === payload.status) ?? "idle";
  const error = state === "error" ? (payload.error ?? FALLBACK_ERROR) : null;
  return { state, percent: clampPercent(payload.percent), error };
}
