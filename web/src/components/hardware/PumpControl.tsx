import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";

interface Props {
  sessionId: string;
  label: string;
  prefix: "" | "2";
}

const CODES = {
  "": { arm: 401, disarm: 400, test: 403, dur: 472 },
  "2": { arm: 411, disarm: 410, test: 413, dur: 482 },
};

const STORE_KEY = { "": "primaryPump", "2": "secondaryPump" } as const;

const MIN_DURATION = 1;
const MAX_DURATION = 600000;

export function PumpControl({ sessionId, label, prefix }: Props) {
  const storeKey = STORE_KEY[prefix];
  const pump = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!pump) return null;

  const { armed, duration } = pump;
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  const update = (patch: Partial<typeof pump>) =>
    updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], ...patch } }));

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {label} Pump
        <PinField sessionId={sessionId} component={prefix === "2" ? "pump2" : "pump"} />
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(codes.arm); update({ armed: true }); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(codes.disarm); update({ armed: false }); }}
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
    </div>
  );
}
