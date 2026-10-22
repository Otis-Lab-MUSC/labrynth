// Pure helpers for device-card "Set" buttons. Erasable TS only: node --test imports this directly.

export interface CardField {
  code: number;
  value: number;
  valid: boolean;
  label?: string;
}

export function buildCardCommands(fields: CardField[]): [number, number][] | null {
  if (fields.some((f) => !f.valid)) return null;
  return fields.map((f) => [f.code, f.value]);
}

export function firstInvalid(fields: CardField[]): string | null {
  const bad = fields.find((f) => !f.valid);
  if (!bad) return null;
  return bad.label ?? "a field";
}

export async function sendAll(
  send: (code: number, value: number) => Promise<unknown> | unknown,
  cmds: [number, number][],
): Promise<{ sent: number; error: string | null }> {
  let sent = 0;
  for (const [code, value] of cmds) {
    try {
      const pending = send(code, value);
      if (pending === undefined) return { sent, error: "not connected" };
      await pending;
    } catch (err) {
      return { sent, error: err instanceof Error ? err.message : String(err) };
    }
    sent++;
  }
  return { sent, error: null };
}

/** Where a card's Set stands against what was last sent to the firmware. */
export type CardSyncState = "not-sent" | "unsent-changes" | "synced";

export const SYNC_LABEL: Record<CardSyncState, string> = {
  "not-sent": "Not sent",
  "unsent-changes": "Unsent changes",
  synced: "Synced",
};

/** Stable fingerprint of what a Set would send (code + value, in order). */
export function fieldsSignature(fields: CardField[]): string {
  return JSON.stringify(fields.map((f) => [f.code, f.value]));
}

/**
 * Sync state of a card. `lastSentSig` is the fieldsSignature captured when the last Set
 * went through (null = never sent from this card). `externalSent`, when a card tracks its
 * own flag (Shock Output's configSent), is authoritative.
 */
export function cardSyncState(
  fields: CardField[],
  lastSentSig: string | null,
  externalSent?: boolean,
): CardSyncState {
  if (externalSent === true) return "synced";
  if (externalSent === false) return lastSentSig === null ? "not-sent" : "unsent-changes";
  if (lastSentSig === null) return "not-sent";
  return fieldsSignature(fields) === lastSentSig ? "synced" : "unsent-changes";
}

/** Red outline only on a device that is armed: a disarmed card may be configured in any order. */
export function showInvalid(armed: boolean, valid: boolean): boolean {
  return armed && !valid;
}
