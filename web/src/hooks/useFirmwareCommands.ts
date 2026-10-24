import { useEffect, useMemo, useRef } from "react";
import { useSessionStore, LIVE_STATES } from "../store/useSessionStore";
import { getClientForSession } from "../api/sessionClient";
import { isLiteParadigm } from "../lib/paradigm";
import type { CommandSpec } from "../types";

/** MICROSCOPE_ARM — present only on two-photon-capable firmware. */
const MICROSCOPE_ARM = 901;

/** AUX_ARM — present only on firmware with the TTL shock output (Mega fr). */
const AUX_ARM = 1401;

/**
 * Fetches each live session's command list once per connect into the session
 * store. Mount once, next to `useSessionWebSockets`. The store nulls the list
 * when the board goes away or the paradigm changes, which re-arms the fetch.
 */
export function useFirmwareCommandsSync() {
  const pending = useSessionStore((s) =>
    [...s.sessions.values()]
      .filter((sess) => !sess.draft && LIVE_STATES.has(sess.state) && sess.firmwareCommands === null)
      .map((sess) => sess.id)
      .join(","),
  );
  const setFirmwareCommands = useSessionStore((s) => s.setFirmwareCommands);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!pending) return;
    for (const id of pending.split(",")) {
      if (inFlight.current.has(id)) continue;
      const client = getClientForSession(id);
      if (!client) continue;
      inFlight.current.add(id);
      client
        .getCommands(id)
        .then((r) => {
          // A board that went away mid-fetch leaves the list null for the next connect.
          const sess = useSessionStore.getState().sessions.get(id);
          if (sess && LIVE_STATES.has(sess.state)) setFirmwareCommands(id, r.commands as unknown as CommandSpec[]);
        })
        .catch(() => {})
        .finally(() => inFlight.current.delete(id));
    }
  }, [pending, setFirmwareCommands]);
}

/**
 * The command set the *running* firmware actually accepts, plus the capability
 * flags derived from it. `commands` is null until a board is connected and the
 * list has arrived; callers then fall back to the paradigm name.
 *
 * Optional hardware is discovered by sniffing this list rather than by branching
 * on the board name: a "_lite" build rejects the two-photon codes with a
 * level-006 error, and the backend already filters them out of what it returns
 * here. The backend distinguishes lite from full by the `sketch` field in the
 * level-000 identification, so this resolves per-firmware, not per-board.
 */
export function useFirmwareCommands(sessionId: string | null) {
  const commands = useSessionStore((s) =>
    sessionId ? s.sessions.get(sessionId)?.firmwareCommands ?? null : null
  );
  const paradigm = useSessionStore((s) =>
    sessionId ? s.sessions.get(sessionId)?.paradigm : undefined
  );

  const codes = useMemo(
    () => (commands ? new Set(commands.map((c) => c.code)) : null),
    [commands],
  );

  /** Null when no list has arrived yet: the caller decides the fallback. */
  const has = useMemo(
    () => (code: number): boolean | null => (codes ? codes.has(code) : null),
    [codes],
  );

  // Before a board answers, the paradigm name is the best guess for two-photon
  // (every non-lite sketch declares 901); AUX needs the IDN caps, so it stays off.
  const hasTwoPhoton = has(MICROSCOPE_ARM) ?? !isLiteParadigm(paradigm);
  const hasAux = has(AUX_ARM) ?? false;

  return { commands: commands ?? [], has, hasTwoPhoton, hasAux };
}
