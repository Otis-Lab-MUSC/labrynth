import type { Session } from "../types";

/** What survives a page reload, per session, in localStorage (`reacher-sessions`). */
export interface StoredSession {
  sessionId: string;
  port: string;
  paradigm: string | null;
  /** deviceId of the owning Machine. Absent in legacy entries — defaults to local. */
  machineId?: string;
  /** Last known paradigm ratio/step/interval, so a reload doesn't silently drop the
   *  value the user configured (and possibly already sent) back to firmware. Absent
   *  in legacy entries or when never configured. */
  paradigmSettings?: Session["paradigmSettings"];
  /** Typed by the user and held nowhere on the backend, so a reload loses them unless
   *  they are stored here. Absent in entries written before this was persisted. */
  name?: string;
  notes?: string;
  limitSettings?: Session["limitSettings"];
}

export function toStoredSession(sess: Session): StoredSession {
  return {
    sessionId: sess.id, port: sess.port, paradigm: sess.paradigm, machineId: sess.machineId,
    paradigmSettings: sess.paradigmSettings,
    name: sess.name, notes: sess.notes, limitSettings: sess.limitSettings,
  };
}

/** The user-entered fields a restored session starts with. */
export function restoredFields(entry: StoredSession) {
  return {
    name: entry.name ?? "",
    notes: entry.notes ?? "",
    paradigmSettings: entry.paradigmSettings ?? null,
    limitSettings: entry.limitSettings ?? null,
  };
}
