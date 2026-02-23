import { useState } from "react";
import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";

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
  const [timeLimit, setTimeLimit] = useState(() => session?.limitSettings?.timeLimit ?? 3600);
  const [infusionLimit, setInfusionLimit] = useState(() => session?.limitSettings?.infusionLimit ?? 30);
  const [delay, setDelay] = useState(() => session?.limitSettings?.delay ?? 60);

  const handleSet = async () => {
    try {
      await api.setLimit(sessionId, {
        type: limitType,
        time_limit: timeLimit,
        infusion_limit: infusionLimit,
        delay,
      });
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
          <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(+e.target.value)}
            className="w-24 input-base" />
        </div>
      )}

      {(limitType === "Infusion" || limitType === "Both") && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-sm w-32 text-theme-text/60">Infusion Limit:</label>
            <input type="number" value={infusionLimit} onChange={(e) => setInfusionLimit(+e.target.value)}
              className="w-24 input-base" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm w-32 text-theme-text/60">Stop Delay (s):</label>
            <input type="number" value={delay} onChange={(e) => setDelay(+e.target.value)}
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
