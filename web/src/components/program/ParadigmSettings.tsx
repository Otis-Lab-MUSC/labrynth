import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { HintIcon } from "../tutorial/HintIcon";

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
  const [pump2Active, setPump2Active] = useState(() => session?.paradigmSettings?.pump2Active ?? false);

  // Sync to store whenever values change
  useEffect(() => {
    setParadigmSettings(sessionId, { ratio, step, interval, traceInterval, pump2Active });
  }, [ratio, step, interval, traceInterval, pump2Active, sessionId]);

  const send = (code: number, value: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  const showTrace = paradigm === "fr" || paradigm === "pr" || paradigm === "vi";

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Paradigm Settings — <span className="text-accent">{paradigm.toUpperCase()}</span><HintIcon hint="Configure the behavioral paradigm parameters. Changes take effect when Set is clicked for each field." helpSection="configuration.paradigm" /></h3>

      {(paradigm === "fr" || paradigm === "pr") && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60 inline-flex items-center">Ratio:<HintIcon hint="Presses required per reinforcement (FR) or starting ratio (PR)." helpSection="configuration.paradigm" /></label>
          <input type="number" value={ratio} onChange={(e) => setRatio(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(201, ratio)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {paradigm === "pr" && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60 inline-flex items-center">PR Step:<HintIcon hint="Amount added to the ratio after each reinforcement in Progressive Ratio." helpSection="configuration.paradigm" /></label>
          <input type="number" value={step} onChange={(e) => setStep(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(205, step)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {paradigm === "vi" && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-24 text-theme-text/60 inline-flex items-center">VI Interval (ms):<HintIcon hint="Variable interval in ms. The firmware samples a random wait within this range." helpSection="configuration.paradigm" /></label>
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
          <label className="text-sm w-24 text-theme-text/60 inline-flex items-center">Trace Interval (ms):<HintIcon hint="Delay in ms between cue offset and reinforcement delivery." helpSection="configuration.paradigm" /></label>
          <input type="number" value={traceInterval} onChange={(e) => setTraceInterval(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(220, traceInterval)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-sm w-24 text-theme-text/60">Reward Pump:</label>
        <button
          onClick={() => {
            const next = !pump2Active;
            setPump2Active(next);
            send(221, next ? 1 : 0);
          }}
          className={`btn-sm ${pump2Active ? "bg-accent text-accent-contrast" : "bg-theme-surface text-theme-text border border-theme-border"}`}
        >
          {pump2Active ? "Secondary (Pump 2)" : "Primary (Pump 1)"}
        </button>
      </div>
    </div>
  );
}
