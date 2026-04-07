import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";

interface Props {
  sessionId: string;
  paradigm: string;
}

export function ParadigmSettings({ sessionId, paradigm }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setParadigmSettings = useSessionStore((s) => s.setParadigmSettings);

  const [ratio, setRatio] = useState(() => session?.paradigmSettings?.ratio ?? 1);
  const [step, setStep] = useState(() => session?.paradigmSettings?.step ?? 1);
  const [interval, setInterval_] = useState(() => session?.paradigmSettings?.interval ?? 30000);
  const [traceInterval, setTraceInterval] = useState(() => session?.paradigmSettings?.traceInterval ?? 0);

  // Sync to store whenever values change
  useEffect(() => {
    setParadigmSettings(sessionId, { ratio, step, interval, traceInterval });
  }, [ratio, step, interval, traceInterval, sessionId]);

  const send = (code: number, value: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  const showTrace = paradigm === "fr" || paradigm === "pr" || paradigm === "vi";

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Paradigm Settings — <span className="text-accent">{paradigm.toUpperCase()}</span></h3>

      {(paradigm === "fr" || paradigm === "pr") && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60">Ratio:</label>
          <input type="number" value={ratio} onChange={(e) => setRatio(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(201, ratio)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {paradigm === "pr" && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60">PR Step:</label>
          <input type="number" value={step} onChange={(e) => setStep(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(205, step)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {paradigm === "vi" && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60">VI Interval (ms):</label>
          <input type="number" value={interval} onChange={(e) => setInterval_(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(204, interval)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {paradigm === "omission" && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60">Omission Interval (ms):</label>
          <input type="number" value={interval} onChange={(e) => setInterval_(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(203, interval)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {/* Issue #2C: Trace Interval */}
      {showTrace && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60">Trace Interval (ms):</label>
          <input type="number" value={traceInterval} onChange={(e) => setTraceInterval(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(220, traceInterval)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}
    </div>
  );
}
