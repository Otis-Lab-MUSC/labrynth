import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { HintIcon } from "../tutorial/HintIcon";

interface Props {
  sessionId: string;
}

interface PavParam {
  code: number;
  label: string;
  default: number;
}

const PAV_PARAMS: PavParam[] = [
  { code: 206, label: "CS+ Reward Prob (%)", default: 100 },
  { code: 207, label: "CS- Reward Prob (%)", default: 0 },
  { code: 208, label: "CS+ Count", default: 50 },
  { code: 209, label: "CS- Count", default: 50 },
  { code: 210, label: "CS+ Frequency (Hz)", default: 12000 },
  { code: 211, label: "CS- Frequency (Hz)", default: 3000 },
  { code: 213, label: "Cue Duration (ms)", default: 2000 },
  { code: 214, label: "Trace Interval (ms)", default: 1000 },
];

const PULSE_PARAMS: PavParam[] = [
  { code: 374, label: "CS+ Pulse On (ms)", default: 0 },
  { code: 375, label: "CS+ Pulse Off (ms)", default: 0 },
  { code: 384, label: "CS- Pulse On (ms)", default: 200 },
  { code: 385, label: "CS- Pulse Off (ms)", default: 200 },
];

const ITI_DEFAULTS = {
  itiMean: 30000,
  itiMin: 10000,
  itiMax: 90000,
};

export function PavlovianSettings({ sessionId }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setPavlovianParams = useSessionStore((s) => s.setPavlovianParams);

  const [values, setValues] = useState<Record<number, number>>(() => {
    const stored = session?.pavlovianParams;
    return Object.fromEntries(
      [...PAV_PARAMS, ...PULSE_PARAMS].map((p) => [p.code, stored?.[p.code] ?? p.default])
    );
  });
  const [itiMean, setItiMean] = useState(() => session?.pavlovianParams?.[216] ?? ITI_DEFAULTS.itiMean);
  const [itiMin, setItiMin] = useState(() => session?.pavlovianParams?.[217] ?? ITI_DEFAULTS.itiMin);
  const [itiMax, setItiMax] = useState(() => session?.pavlovianParams?.[218] ?? ITI_DEFAULTS.itiMax);

  const getItiValues = (): Record<number, number> => {
    return { 216: itiMean, 217: itiMin, 218: itiMax };
  };

  const getAllValues = (): Record<number, number> => ({
    ...values,
    ...getItiValues(),
  });

  // Sync to store whenever values change
  useEffect(() => {
    setPavlovianParams(sessionId, getAllValues());
  }, [values, itiMean, itiMin, itiMax, sessionId]);

  const update = (code: number, val: number) =>
    setValues((prev) => ({ ...prev, [code]: val }));

  const send = (code: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, values[code]);

  const itiValid = itiMin <= itiMean && itiMean <= itiMax && itiMin >= 0 && itiMax > 0;

  const sendAll = async () => {
    for (const p of PAV_PARAMS) {
      await getClientForSession(sessionId)?.sendCommand(sessionId,p.code, values[p.code]);
    }
    for (const p of PULSE_PARAMS) {
      await getClientForSession(sessionId)?.sendCommand(sessionId,p.code, values[p.code]);
    }
    const iti = getItiValues();
    await getClientForSession(sessionId)?.sendCommand(sessionId,216, iti[216]);
    await getClientForSession(sessionId)?.sendCommand(sessionId,217, iti[217]);
    await getClientForSession(sessionId)?.sendCommand(sessionId,218, iti[218]);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-theme-text">Pavlovian Parameters<HintIcon hint="CS+/CS− trial timing and probability settings. Use Send All to push all values to the board at once." helpSection="configuration.paradigm" /></h3>
        <button onClick={sendAll} disabled={!itiValid}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Send All</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PAV_PARAMS.map((p) => (
          <div key={p.code} className="flex items-center gap-2">
            <label className="text-sm flex-1 text-theme-text/60">{p.label}:</label>
            <input
              type="number"
              value={values[p.code]}
              onChange={(e) => update(p.code, +e.target.value)}
              className="w-20 input-base"
            />
            <button onClick={() => send(p.code)} className="btn-sm bg-accent text-accent-contrast text-xs">Set</button>
          </div>
        ))}
      </div>

      {/* Pulse Configuration */}
      <div className="mt-4 border-t border-theme-border pt-4">
        <span className="text-sm font-medium text-theme-text inline-flex items-center">Pulse Configuration<HintIcon hint="Set CS+ Pulse On to 0 for a continuous tone. CS− defaults to 200ms/200ms pulsed." helpSection="configuration.paradigm" /></span>
        <p className="text-xs text-theme-text/40 mt-1">Set pulse ON to 0 for continuous tone. CS+ defaults to continuous; CS- defaults to 200ms/200ms pulsed.</p>
        <div className="grid gap-2 sm:grid-cols-2 mt-3">
          {PULSE_PARAMS.map((p) => (
            <div key={p.code} className="flex items-center gap-2">
              <label className="text-sm flex-1 text-theme-text/60">{p.label}:</label>
              <input
                type="number"
                value={values[p.code]}
                min={0} max={60000}
                onChange={(e) => update(p.code, +e.target.value)}
                className="w-20 input-base"
              />
              <button onClick={() => send(p.code)} className="btn-sm bg-accent text-accent-contrast text-xs">Set</button>
            </div>
          ))}
        </div>
      </div>

      {/* ITI Configuration */}
      <div className="mt-4 border-t border-theme-border pt-4">
        <span className="text-sm font-medium text-theme-text inline-flex items-center">ITI Distribution<HintIcon hint="Inter-trial interval is sampled from a uniform distribution between Min and Max." helpSection="configuration.paradigm" /></span>
        {!itiValid && (
          <p className="text-xs text-red-500 mt-1">ITI values must satisfy: Min &le; Mean &le; Max (all &ge; 0, Max &gt; 0)</p>
        )}
        <div className="grid gap-2 mt-3">
          <div className="flex items-center gap-2">
            <label className="text-sm flex-1 text-theme-text/60">ITI Mean (ms):</label>
            <input
              type="number"
              value={itiMean} min={0} max={600000}
              onChange={(e) => setItiMean(+e.target.value)}
              className="w-24 input-base"
            />
            <button
              onClick={() => getClientForSession(sessionId)?.sendCommand(sessionId,216, itiMean)}
              disabled={!itiValid}
              className="btn-sm bg-accent text-accent-contrast text-xs disabled:opacity-50"
            >
              Set
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm flex-1 text-theme-text/60">ITI Min (ms):</label>
            <input
              type="number"
              value={itiMin} min={0} max={600000}
              onChange={(e) => setItiMin(+e.target.value)}
              className="w-24 input-base"
            />
            <button
              onClick={() => getClientForSession(sessionId)?.sendCommand(sessionId,217, itiMin)}
              disabled={!itiValid}
              className="btn-sm bg-accent text-accent-contrast text-xs disabled:opacity-50"
            >
              Set
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm flex-1 text-theme-text/60">ITI Max (ms):</label>
            <input
              type="number"
              value={itiMax} min={0} max={600000}
              onChange={(e) => setItiMax(+e.target.value)}
              className="w-24 input-base"
            />
            <button
              onClick={() => getClientForSession(sessionId)?.sendCommand(sessionId,218, itiMax)}
              disabled={!itiValid}
              className="btn-sm bg-accent text-accent-contrast text-xs disabled:opacity-50"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
