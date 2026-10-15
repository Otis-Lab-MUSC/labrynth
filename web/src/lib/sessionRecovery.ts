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
}

export function toStoredSession(sess: Session): StoredSession {
  return {
    sessionId: sess.id, port: sess.port, paradigm: sess.paradigm, machineId: sess.machineId,
    paradigmSettings: sess.paradigmSettings,
  };
}

/** The user-entered fields a restored session starts with. */
export function restoredFields(entry: StoredSession) {
  return {
    name: "",
    notes: "",
    paradigmSettings: entry.paradigmSettings ?? null,
    limitSettings: null,
  };
}
