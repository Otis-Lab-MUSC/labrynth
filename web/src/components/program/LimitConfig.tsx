import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";

/** Seeds for a session with no stored limits. Shared by the initial state and
 *  the reset resync below so the two cannot drift. */
const LIMIT_DEFAULTS = { timeLimit: 3600, infusionLimit: 30, delay: 10 };

interface Props {
  sessionId: string;
  paradigm?: string;
}

export function LimitConfig({ sessionId, paradigm }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setLimitSettings = useSessionStore((s) => s.setLimitSettings);

  const isPavlovian = paradigm === "pavlovian";
  const defaultLimitType = isPavlovian ? "Trials" : "Time";

  const [limitType, setLimitType] = useState(() => session?.limitSettings?.limitType ?? defaultLimitType);
  const [timeLimit, setTimeLimit] = useState(() => session?.limitSettings?.timeLimit ?? LIMIT_DEFAULTS.timeLimit);
  const [infusionLimit, setInfusionLimit] = useState(() => session?.limitSettings?.infusionLimit ?? LIMIT_DEFAULTS.infusionLimit);
  const [delay, setDelay] = useState(() => session?.limitSettings?.delay ?? LIMIT_DEFAULTS.delay);

  // These inputs seed once, but a "Full Reset" nulls limitSettings underneath a panel
  // that never unmounts (useSessionStore.resetSessionData), so without this they keep
  // displaying the pre-reset limits while the store holds nothing. Nothing is skipped
  // downstream — SessionStartModal re-seeds from the store every time it opens and its
  // setLimit() call is unconditional — so the run simply uses the defaults while this
  // panel still claims the old values. Resyncing here keeps the two in agreement.
  // Deliberately does not write the store: this component records a limit only after
  // the server has acknowledged it (see handleSet).
  useEffect(() => {
    if (session?.limitSettings) return;
    setLimitType(defaultLimitType);
    setTimeLimit(LIMIT_DEFAULTS.timeLimit);
    setInfusionLimit(LIMIT_DEFAULTS.infusionLimit);
    setDelay(LIMIT_DEFAULTS.delay);
  }, [session?.limitSettings, defaultLimitType]);

  const handleSet = async () => {
    try {
      const limitPayload: { type: string; time_limit?: number; infusion_limit?: number; delay?: number } = {
        type: limitType,
      };
      if (limitType === "Time" || limitType === "Both") {
        limitPayload.time_limit = timeLimit;
      }
      if (limitType === "Infusion" || limitType === "Both") {
        limitPayload.infusion_limit = infusionLimit;
        limitPayload.delay = delay;
      }
      await getClientForSession(sessionId)?.setLimit(sessionId, limitPayload);
      // Only persist to store after server acknowledges
      setLimitSettings(sessionId, { limitType, timeLimit, infusionLimit, delay });
    } catch {
      // Revert to last known good state from store
    }
  };

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Limits</h3>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Type:</label>
        <select
          value={limitType}
          onChange={(e) => setLimitType(e.target.value)}
          className="input-base"
        >
          {isPavlovian ? (
            <>
              <option value="Trials">Trials</option>
              <option value="Infusion">Infusion</option>
            </>
          ) : (
            <>
              <option value="Time">Time</option>
              <option value="Infusion">Infusion</option>
              <option value="Both">Both</option>
            </>
          )}
        </select>
      </div>

      {!isPavlovian && (limitType === "Time" || limitType === "Both") && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-32 text-theme-text/60">Time Limit (s):</label>
          <input type="number" value={timeLimit} min={1} max={86400}
            onChange={(e) => setTimeLimit(+e.target.value)}
            className="w-24 input-base" />
        </div>
      )}

      {(limitType === "Infusion" || limitType === "Both") && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-sm w-32 text-theme-text/60">Infusion Limit:</label>
            <input type="number" value={infusionLimit} min={1} max={10000}
              onChange={(e) => setInfusionLimit(+e.target.value)}
              className="w-24 input-base" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm w-32 text-theme-text/60">Stop Delay (s):</label>
            <input type="number" value={delay} min={0} max={86400}
              onChange={(e) => setDelay(+e.target.value)}
              className="w-24 input-base" />
          </div>
        </>
      )}

      <button onClick={handleSet} className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover">
        Set Limits
      </button>
    </div>
  );
}
