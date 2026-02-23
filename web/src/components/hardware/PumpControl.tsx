import { useState } from "react";
import * as api from "../../api/client";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
  label: string;
  prefix: "" | "2";
}

const CODES = {
  "": { arm: 401, disarm: 400, test: 403, dur: 472 },
  "2": { arm: 411, disarm: 410, test: 413, dur: 482 },
};

export function PumpControl({ sessionId, label, prefix }: Props) {
  const [duration, setDuration] = useState(3000);
  const [armed, setArmed] = useState(false);
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => api.sendCommand(sessionId, code, value);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {label} Pump
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS[prefix === "2" ? "PUMP_2" : "PUMP"]}</span>
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(codes.arm); setArmed(true); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(codes.disarm); setArmed(false); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(codes.test)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Duration (ms):</label>
        <input type="number" value={duration} min={1} max={600000}
          onChange={(e) => setDuration(+e.target.value)}
          className="w-24 input-base" />
        <button onClick={() => send(codes.dur, duration)}
          disabled={duration < 1 || duration > 600000}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
