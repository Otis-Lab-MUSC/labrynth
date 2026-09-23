import { useState, useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { useLogStore } from "../../store/useLogStore";
import { isParadigm } from "../../lib/paradigm";

/** Mirrors ConfigurationPanel's DEFAULT_PARADIGM_SETTINGS. */
const DEFAULTS = { ratio: 1, step: 1, interval: 30000 };

/** Matches backend `_VALUE_RANGES["ratio"] = (1, 255)` (reacher hardware.py:29) — an
 *  integer, since the wire type is `uint8_t`. One predicate for both the Set button's
 *  disabled state and the store-write guard below, so the two cannot drift apart. */
function isValidRatio(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 255;
}

interface Props {
  sessionId: string;
  paradigm: string;
}

export function ParadigmSettings({ sessionId, paradigm }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setParadigmSettings = useSessionStore((s) => s.setParadigmSettings);

  const [ratio, setRatio] = useState(() => session?.paradigmSettings?.ratio ?? DEFAULTS.ratio);
  const [step, setStep] = useState(() => session?.paradigmSettings?.step ?? DEFAULTS.step);
  const [interval, setInterval_] = useState(() => session?.paradigmSettings?.interval ?? DEFAULTS.interval);

  // Seed defaults whenever the session carries no paradigm settings, and only then.
  // Syncing on every [ratio,step,interval] change (the pre-T2 shape) also fired right
  // after mount and clobbered an existing paradigmSettings with the just-seeded local
  // defaults — that was E2. But leaving paradigmSettings null is its own regression:
  // SessionStartModal's validateConfig sends `paradigmSettings ?? undefined`, and
  // reacher's rule `(_ps(req,"ratio") or 0) < 1` treats a missing ratio as 0 and fails
  // validation, blocking start behind an acknowledge dialog; separately
  // SessionStartModal.tsx:126 guards command 201 on `session.paradigmSettings` being
  // truthy, so a null value means 201 is silently never sent either.
  //
  // Gated on the store value rather than a mount-once ref (T2b's shape): that ref could
  // only fire at mount, so a "Full Reset" — which nulls paradigmSettings under a panel
  // that stays mounted — left the inputs showing the pre-reset ratio while the store held
  // null, and start failed validation citing a ratio the panel was visibly displaying.
  // Resetting the local inputs alongside the store is what keeps the two in agreement.
  useEffect(() => {
    if (session?.paradigmSettings) return;
    setRatio(DEFAULTS.ratio);
    setStep(DEFAULTS.step);
    setInterval_(DEFAULTS.interval);
    setParadigmSettings(sessionId, DEFAULTS);
  }, [session?.paradigmSettings, sessionId, setParadigmSettings]);

  const updateRatio = (value: number) => {
    // Local state always takes the raw typed value — the field must show exactly
    // what the user typed, mid-edit, even while it's out of range (e.g. typing "25"
    // on the way to "250", or a momentarily-empty box). Only the store write below
    // is guarded: the system will never accept an out-of-range or fractional ratio
    // (Set is disabled for it, and the backend 400/422s it at start), so there is no
    // reason for that value to ever land in paradigmSettings / localStorage. The
    // store simply holds the last value that WAS valid until the user types another one.
    setRatio(value);
    if (isValidRatio(value)) {
      setParadigmSettings(sessionId, { ratio: value, step, interval });
    }
  };
  const updateStep = (value: number) => {
    setStep(value);
    setParadigmSettings(sessionId, { ratio, step: value, interval });
  };
  const updateInterval = (value: number) => {
    setInterval_(value);
    setParadigmSettings(sessionId, { ratio, step, interval: value });
  };

  const send = async (code: number, value: number) => {
    try {
      await getClientForSession(sessionId)?.sendCommand(sessionId, code, value);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Failed to send paradigm command");
      useLogStore.getState().setOpen(true);
    }
  };

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Paradigm Settings — <span className="text-accent">{paradigm.toUpperCase()}</span></h3>

      {isParadigm(paradigm, "fr", "pr") && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label className="text-sm w-40 text-theme-text/60">Reinforcement ratio:</label>
            <input type="number" value={ratio} min={1} max={255}
              onChange={(e) => updateRatio(+e.target.value)}
              className="w-24 input-base" />
            <button onClick={() => send(201, ratio)}
              disabled={!isValidRatio(ratio)}
              className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
          </div>
          <p className="text-xs text-theme-text/50">
            Active presses required per reward. Scheduler-wide: one value per board, counted across every reinforced lever.
          </p>
        </div>
      )}

      {isParadigm(paradigm, "pr") && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-40 text-theme-text/60">PR Step:</label>
          <input type="number" value={step} onChange={(e) => updateStep(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(205, step)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {isParadigm(paradigm, "vi") && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-40 text-theme-text/60">VI Interval (ms):</label>
          <input type="number" value={interval} onChange={(e) => updateInterval(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(204, interval)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

      {isParadigm(paradigm, "omission") && (
        <div className="flex items-center gap-2">
          <label className="text-sm w-40 text-theme-text/60">Omission Interval (ms):</label>
          <input type="number" value={interval} onChange={(e) => updateInterval(+e.target.value)}
            className="w-24 input-base" />
          <button onClick={() => send(203, interval)} className="btn-sm bg-accent text-accent-contrast">Set</button>
        </div>
      )}

    </div>
  );
}
