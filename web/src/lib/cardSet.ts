// Pure helpers for the per-field upload buttons. Erasable TS only: node --test imports this directly.

export interface CardField {
  code: number;
  /** Omitted for a command that takes no value (e.g. "RH lever is active"). */
  value?: number;
  valid: boolean;
  label?: string;
  /** Needed for the device to run. Only required fields go red or amber; optional ones never warn. */
  required?: boolean;
}

/** How a card sends one command. Returns undefined when there is no client (not connected). */
export type CardSend = (code: number, value?: number) => Promise<unknown> | unknown;

export type CardCommand = [code: number, value: number | undefined];

export function buildCardCommands(fields: CardField[]): CardCommand[] | null {
  if (fields.some((f) => !f.valid)) return null;
  return fields.map((f) => [f.code, f.value]);
}

export function firstInvalid(fields: CardField[]): string | null {
  const bad = fields.find((f) => !f.valid);
  if (!bad) return null;
  return bad.label ?? "a field";
}

/** Labels of every invalid field, in card order. */
export function invalidLabels(fields: CardField[]): string[] {
  return fields.filter((f) => !f.valid).map((f) => f.label ?? "a field");
}

/** One line telling the user what to fill in, e.g. "Fill in Freq (Hz) and Dur (ms), then upload." */
export function describeMissingFields(labels: string[]): string {
  if (labels.length === 0) return "";
  const last = labels[labels.length - 1];
  const list = labels.length === 1 ? last : `${labels.slice(0, -1).join(", ")} and ${last}`;
  return `Fill in ${list}, then upload.`;
}

export async function sendAll(
  send: CardSend,
  cmds: CardCommand[],
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

/** Where a card's sync stands against what was last sent to the firmware. */
export type CardSyncState = "not-sent" | "unsent-changes" | "synced";

/**
 * True when the user should press upload: the value changed since the last upload, or the device
 * is armed and the value has never been uploaded. Untouched, disarmed cards stay quiet.
 */
export function needsSync(state: CardSyncState, armed: boolean): boolean {
  if (state === "unsent-changes") return true;
  return state === "not-sent" && armed;
}

/**
 * One field's upload button: the command(s) it sends. Usually one; a grouped control (e.g. the
 * reinforced lever, which is a pair of valueless commands) sends several.
 */
export interface UploadField {
  /** Unique within its card; keys the remembered last-uploaded value. */
  id: string;
  label: string;
  fields: CardField[];
  /** Overrides the remembered fingerprint, e.g. so two cards writing one shared register agree. */
  signature?: string;
  /** Card id the upload is remembered under, when two cards share one firmware register. */
  scope?: string;
  /** Needed for the device to run (see CardField.required). */
  required?: boolean;
}

/** The usual case: one field, one command, keyed by its command code. */
export function asUpload(field: CardField): UploadField {
  return {
    id: String(field.code), label: field.label ?? "this value", fields: [field], required: field.required ?? false,
  };
}

/** What an upload of this field would send, as a comparable string. */
export function uploadSignature(field: UploadField): string {
  return field.signature ?? fieldsSignature(field.fields);
}

/**
 * Where one field's upload stands. `lastSig` is the last upload (null = never); `baseSig` is the
 * value as first shown, so a never-uploaded field that has been edited still counts as changed.
 */
export function uploadState(field: UploadField, lastSig: string | null, baseSig: string | null = null): CardSyncState {
  const sig = uploadSignature(field);
  if (lastSig !== null) return sig === lastSig ? "synced" : "unsent-changes";
  return baseSig !== null && sig !== baseSig ? "unsent-changes" : "not-sent";
}

/**
 * True when the upload button should be amber. Only required fields warn: blank or invalid on an
 * armed card, changed since the last upload, or armed and never uploaded. Optional fields never do.
 */
export function isUploadPending(
  field: UploadField, lastSig: string | null, armed: boolean, baseSig: string | null = null,
): boolean {
  if (!field.required) return false;
  if (buildCardCommands(field.fields) === null) return armed;
  return needsSync(uploadState(field, lastSig, baseSig), armed);
}

/**
 * True when the card should list this field under "Unsent changes": a valid value the board does
 * not have yet. Covers optional fields too (changed only), so a forgotten delay is still visible.
 */
export function isUnsent(
  field: UploadField, lastSig: string | null, armed: boolean, baseSig: string | null = null,
): boolean {
  if (buildCardCommands(field.fields) === null) return false;
  if (uploadState(field, lastSig, baseSig) === "unsent-changes") return true;
  return isUploadPending(field, lastSig, armed, baseSig);
}

/** The card's warning line, e.g. "Unsent changes: Delay (ms) and Pin"; empty when none. */
export function describeUnsent(labels: string[]): string {
  if (labels.length === 0) return "";
  const last = labels[labels.length - 1];
  const list = labels.length === 1 ? last : `${labels.slice(0, -1).join(", ")} and ${last}`;
  return `Unsent changes: ${list}. Press the upload button beside each.`;
}

/** Stable fingerprint of what a sync would send (code + value, in order). */
export function fieldsSignature(fields: CardField[]): string {
  return JSON.stringify(fields.map((f) => [f.code, f.value ?? null]));
}

/**
 * Sync state of a card. `lastSentSig` is the fieldsSignature captured when the last sync
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
