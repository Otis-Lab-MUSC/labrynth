import { useEffect, useState } from "react";
import { getClientForSession } from "../api/sessionClient";
import { useSessionStore } from "../store/useSessionStore";

export type RewardPump = "PUMP" | "PUMP2" | null;

/** The pump the reward chain targets, as the host holds it (not what the UI has armed).
 *  Prefers the firmware's own ack (CONTROLLER `active_pump`); otherwise the host-persisted
 *  last 221 for this port from GET /hardware/{id}/config. null = unknown / never set. */
export function useRewardPump(sessionId: string | null): RewardPump {
  const ack = useSessionStore((s) => {
    if (!sessionId) return undefined;
    const row = s.sessions.get(sessionId)?.hardwareSettings.find((h) => (h as Record<string, unknown>).device === "CONTROLLER");
    return (row as Record<string, unknown> | undefined)?.active_pump;
  });
  const settings = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId)?.hardwareSettings : undefined));
  const [persisted, setPersisted] = useState<RewardPump>(null);

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    getClientForSession(sessionId)
      ?.getConfig(sessionId)
      .then((cfg) => {
        const t = (cfg as { pump_target?: RewardPump }).pump_target;
        if (live) setPersisted(t === "PUMP" || t === "PUMP2" ? t : null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [sessionId, settings]);

  if (ack === "PUMP" || ack === "PUMP2") return ack;
  return persisted;
}
