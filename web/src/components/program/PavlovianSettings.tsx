import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import type { CommandSpec } from "../../types";
import { ITI_CODES, PULSE_CODES, labelForCode } from "./pavLabels";

interface Props {
  sessionId: string;
}

/**
 * Fallback defaults for codes not supplied by an applied preset (or a fresh
 * session with no preset). The registry decides *which* params render; these
 * supply sane initial values. Codes absent here default to 0.
 */
const CODE_DEFAULTS: Record<number, number> = {
  206: 100,   // CS+ Reward Prob (%)
  207: 0,     // CS- Reward Prob (%)
  208: 50,    // CS+ Count
  209: 50,    // CS- Count
  212: 0,     // Counterbalance (off)
  214: 1000,  // Trace Interval (ms)
  215: 5000,  // Consumption Window (ms) — must be >= 1 (backend bound)
  219: 0,     // Pulse Config
  374: 0,     // CS+ Pulse On (ms) — continuous
  375: 0,     // CS+ Pulse Off (ms)
  384: 200,   // CS- Pulse On (ms)
  385: 200,   // CS- Pulse Off (ms)
};

const ITI_FALLBACK = { 216: 30000, 217: 10000, 218: 90000 } as const;

const [ITI_MEAN, ITI_MIN, ITI_MAX] = ITI_CODES;

export function PavlovianSettings({ sessionId }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setPavlovianParams = useSessionStore((s) => s.setPavlovianParams);

  // Pavlovian param list is sourced from reacher's command registry (already
  // paradigm-filtered + deprecation-stripped server-side), so re-enabled or
  // newly added params surface automatically with no frontend code change.
  const [specs, setSpecs] = useState<CommandSpec[]>([]);
  const [values, setValues] = useState<Record<number, number>>({});
  const [itiMean, setItiMean] = useState(() => session?.pavlovianParams?.[ITI_MEAN] ?? ITI_FALLBACK[216]);
  const [itiMin, setItiMin] = useState(() => session?.pavlovianParams?.[ITI_MIN] ?? ITI_FALLBACK[217]);
  const [itiMax, setItiMax] = useState(() => session?.pavlovianParams?.[ITI_MAX] ?? ITI_FALLBACK[218]);

  // Fetch the registry-driven command set for this session's paradigm.
  useEffect(() => {
    let cancelled = false;
    getClientForSession(sessionId)
      ?.getCommands(sessionId)
      .then((r) => {
        if (!cancelled) setSpecs(r.commands as unknown as CommandSpec[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, session?.paradigm]);

  // Partition the dynamic command set into the three UI groups. Pulse codes live
  // in the 3xx range, so partition by explicit code sets rather than a range.
  const isSettable = (s: CommandSpec) => s.payload_key != null;
  const scalarParams = specs.filter(
    (s) => isSettable(s) && s.code >= 206 && s.code <= 219 && !ITI_CODES.includes(s.code as (typeof ITI_CODES)[number]),
  );
  const pulseParams = specs.filter((s) => PULSE_CODES.includes(s.code as (typeof PULSE_CODES)[number]));
  const itiPresent = ITI_CODES.every((c) => specs.some((s) => s.code === c));

  // Seed scalar + pulse values once the spec list arrives (or the session
  // changes). Keyed on (sessionId, specs) so user edits within a session aren't
  // clobbered. Values prefer stored params, then preset/local default, then 0.
  useEffect(() => {
    if (specs.length === 0) return;
    const stored = session?.pavlovianParams;
    const next: Record<number, number> = {};
    for (const p of [...scalarParams, ...pulseParams]) {
      next[p.code] = stored?.[p.code] ?? CODE_DEFAULTS[p.code] ?? 0;
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, specs]);

  const getItiValues = (): Record<number, number> => ({ [ITI_MEAN]: itiMean, [ITI_MIN]: itiMin, [ITI_MAX]: itiMax });

  const getAllValues = (): Record<number, number> => ({
    ...values,
    ...(itiPresent ? getItiValues() : {}),
  });

  // Sync to store once seeded (guard against clobbering with an empty map before
  // the spec list has loaded).
  useEffect(() => {
    if (Object.keys(values).length === 0) return;
    setPavlovianParams(sessionId, getAllValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, itiMean, itiMin, itiMax, sessionId]);

  const update = (code: number, val: number) => setValues((prev) => ({ ...prev, [code]: val }));

  const send = (code: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, values[code]);

  const itiValid = itiMin <= itiMean && itiMean <= itiMax && itiMin >= 0 && itiMax > 0;

  const sendAll = async () => {
    const client = getClientForSession(sessionId);
    for (const p of [...scalarParams, ...pulseParams]) {
      await client?.sendCommand(sessionId, p.code, values[p.code]);
    }
    if (itiPresent) {
      const iti = getItiValues();
      await client?.sendCommand(sessionId, ITI_MEAN, iti[ITI_MEAN]);
      await client?.sendCommand(sessionId, ITI_MIN, iti[ITI_MIN]);
      await client?.sendCommand(sessionId, ITI_MAX, iti[ITI_MAX]);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-theme-text">Pavlovian Parameters</h3>
        <button onClick={sendAll} disabled={!itiValid}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Send All</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {scalarParams.map((p) => (
          <div key={p.code} className="flex items-center gap-2">
            <label className="text-sm flex-1 text-theme-text/60">{labelForCode(p.code, specs)}:</label>
            {p.payload_type === "bool" ? (
              <input
                type="checkbox"
                checked={values[p.code] === 1}
                onChange={(e) => update(p.code, e.target.checked ? 1 : 0)}
                className="h-4 w-4 accent-accent"
              />
            ) : (
              <input
                type="number"
                value={values[p.code] ?? 0}
                onChange={(e) => update(p.code, +e.target.value)}
                className="w-20 input-base"
              />
            )}
            <button onClick={() => send(p.code)} className="btn-sm bg-accent text-accent-contrast text-xs">Set</button>
          </div>
        ))}
      </div>

      {/* Pulse Configuration */}
      {pulseParams.length > 0 && (
        <div className="mt-4 border-t border-theme-border pt-4">
          <span className="text-sm font-medium text-theme-text">Pulse Configuration</span>
          <p className="text-xs text-theme-text/40 mt-1">Set pulse ON to 0 for continuous tone. CS+ defaults to continuous; CS- defaults to 200ms/200ms pulsed.</p>
          <div className="grid gap-2 sm:grid-cols-2 mt-3">
            {pulseParams.map((p) => (
              <div key={p.code} className="flex items-center gap-2">
                <label className="text-sm flex-1 text-theme-text/60">{labelForCode(p.code, specs)}:</label>
                <input
                  type="number"
                  value={values[p.code] ?? 0}
                  min={0} max={60000}
                  onChange={(e) => update(p.code, +e.target.value)}
                  className="w-20 input-base"
                />
                <button onClick={() => send(p.code)} className="btn-sm bg-accent text-accent-contrast text-xs">Set</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ITI Configuration */}
      {itiPresent && (
        <div className="mt-4 border-t border-theme-border pt-4">
          <span className="text-sm font-medium text-theme-text">ITI Distribution</span>
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
                onClick={() => getClientForSession(sessionId)?.sendCommand(sessionId, ITI_MEAN, itiMean)}
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
                onClick={() => getClientForSession(sessionId)?.sendCommand(sessionId, ITI_MIN, itiMin)}
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
                onClick={() => getClientForSession(sessionId)?.sendCommand(sessionId, ITI_MAX, itiMax)}
                disabled={!itiValid}
                className="btn-sm bg-accent text-accent-contrast text-xs disabled:opacity-50"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
