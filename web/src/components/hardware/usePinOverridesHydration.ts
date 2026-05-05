import { useEffect } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { getClientForSession } from "../../api/sessionClient";

/**
 * On `(sessionId, session.state)` transitioning to "connected", read
 * `/api/hardware/{id}/config` and write any pin assignments found into the
 * session store's `pinOverrides`. The backend replays persisted pin overrides
 * automatically on connect, so the connected firmware already reflects them;
 * this hook just surfaces them in the UI.
 */
export function usePinOverridesHydration(sessionId: string | null | undefined) {
  const state = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId)?.state : undefined));
  const setPinOverrides = useSessionStore((s) => s.setPinOverrides);

  useEffect(() => {
    if (!sessionId || state !== "connected") return;
    const client = getClientForSession(sessionId);
    if (!client) return;
    let cancelled = false;
    client.getConfig(sessionId).then((cfg) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      const componentByDevice: Record<string, string> = {
        CUE: "cue", CUE2: "cue2",
        PUMP: "pump", PUMP2: "pump2",
        LICK_CIRCUIT: "lick", LASER: "laser",
        LEVER_RH: "lever_rh", LEVER_LH: "lever_lh",
      };
      for (const entry of (cfg.hardware_settings ?? []) as Array<Record<string, unknown>>) {
        const dev = entry.device as string | undefined;
        if (!dev) continue;
        if (dev === "MICROSCOPE") {
          const tp = entry.trigger_pin;
          if (typeof tp === "number") next.microscope_trigger = tp;
          continue;
        }
        const c = componentByDevice[dev];
        const p = entry.pin;
        if (c && typeof p === "number") next[c] = p;
      }
      if (Object.keys(next).length > 0) setPinOverrides(sessionId, next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, state, setPinOverrides]);
}
