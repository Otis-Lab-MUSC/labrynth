import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../store/useSessionStore";
import { getClientForSession } from "../api/sessionClient";
import type { CommandSpec } from "../types";

/** MICROSCOPE_ARM — present only on two-photon-capable firmware. */
const MICROSCOPE_ARM = 901;
/** EXT_TRIGGER_ARM — present only on firmware built with external-trigger support. */
const EXT_TRIGGER_ARM = 1201;

/**
 * The command set the *running* firmware actually accepts, plus the capability
 * flags derived from it.
 *
 * Optional hardware is discovered by sniffing this list rather than by branching
 * on the board name: a "_lite" build rejects the two-photon codes with a
 * level-006 error, and the backend already filters them out of what it returns
 * here. The backend distinguishes lite from full by the `sketch` field in the
 * level-000 identification, so this resolves per-firmware, not per-board.
 */
export function useFirmwareCommands(sessionId: string | null) {
  const paradigm = useSessionStore((s) =>
    sessionId ? s.sessions.get(sessionId)?.paradigm : undefined
  );
  const [commands, setCommands] = useState<CommandSpec[]>([]);

  useEffect(() => {
    // Early-return rather than clearing: a synchronous setState here would
    // cascade a render, and there is nothing to clear for in practice — with no
    // session the capability-gated UI is not mounted at all.
    if (!sessionId) return;
    let cancelled = false;
    getClientForSession(sessionId)
      ?.getCommands(sessionId)
      .then((r) => {
        if (!cancelled) setCommands(r.commands as unknown as CommandSpec[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, paradigm]);

  const hasTwoPhoton = useMemo(
    () => commands.some((c) => c.code === MICROSCOPE_ARM),
    [commands],
  );
  const hasExternalTrigger = useMemo(
    () => commands.some((c) => c.code === EXT_TRIGGER_ARM),
    [commands],
  );

  return { commands, hasTwoPhoton, hasExternalTrigger };
}
