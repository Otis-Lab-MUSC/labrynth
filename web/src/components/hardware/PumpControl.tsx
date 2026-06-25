import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";
import { ContingencySection } from "./ContingencySection";

interface Props {
  sessionId: string;
  label: string;
  prefix: "" | "2";
  paradigm?: string;
}

const CODES = {
  "": { arm: 401, disarm: 400, test: 403, dur: 472 },
  "2": { arm: 411, disarm: 410, test: 413, dur: 482 },
};

const STORE_KEY = { "": "primaryPump", "2": "secondaryPump" } as const;

const SET_ACTIVE_PUMP = 221;
const MIN_DURATION = 1;
const MAX_DURATION = 600000;

export function PumpControl({ sessionId, label, prefix, paradigm }: Props) {
  const storeKey = STORE_KEY[prefix];
  const siblingPrefix = (prefix === "" ? "2" : "") as "" | "2";
  const siblingKey = STORE_KEY[siblingPrefix];

  // All hooks unconditionally before any early return (Rules of Hooks)
  const pump = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const siblingPump = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[siblingKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!pump) return null;

  const { armed, duration } = pump;
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  const update = (patch: Partial<typeof pump>) =>
    updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], ...patch } }));

  const isOperant = paradigm !== undefined && paradigm !== "pavlovian";

  const handleArm = () => {
    if (isOperant) {
      const sibling = useSessionStore.getState().sessions.get(sessionId)?.hardwareUi[siblingKey];
      if (sibling?.armed) {
        send(CODES[siblingPrefix].disarm);
        updateHardwareUi(sessionId, (prev) => ({
          [siblingKey]: { ...(prev[siblingKey] as object), armed: false },
        }));
      }
      send(codes.arm);
      send(SET_ACTIVE_PUMP, prefix === "2" ? 1 : 0);
    } else {
      send(codes.arm);
    }
    update({ armed: true });
  };

  const handleDisarm = () => {
    send(codes.disarm);
    if (isOperant && prefix === "2") {
      send(SET_ACTIVE_PUMP, 0);
    }
    update({ armed: false });
  };

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text flex items-center gap-2 flex-wrap">
        <span>Pump {label}</span>
        <PinField sessionId={sessionId} component={prefix === "2" ? "pump2" : "pump"} />
        {isOperant && armed && !siblingPump?.armed && (
          <span className="rounded px-1.5 py-0.5 text-xs font-mono bg-green-600/20 text-green-400 uppercase tracking-wide">
            Active
          </span>
        )}
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleArm}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={handleDisarm}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(codes.test)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Duration (ms):</label>
        <input type="number" value={duration} min={MIN_DURATION} max={MAX_DURATION}
          onChange={(e) => update({ duration: +e.target.value })}
          className="w-24 input-base" />
        <button onClick={() => send(codes.dur, duration)}
          disabled={duration < MIN_DURATION || duration > MAX_DURATION}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <ContingencySection sessionId={sessionId} deviceKey={storeKey} paradigm={paradigm} />
    </div>
  );
}
