import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
  label: string;
  prefix: "" | "2";
}

const CODES = {
  "": { arm: 301, disarm: 300, test: 303, freq: 371, dur: 372 },
  "2": { arm: 311, disarm: 310, test: 313, freq: 381, dur: 382 },
};

const STORE_KEY = { "": "primaryCue", "2": "secondaryCue" } as const;

export function CueControl({ sessionId, label, prefix }: Props) {
  const storeKey = STORE_KEY[prefix];
  const cue = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!cue) return null;

  const { armed, frequency, duration } = cue;
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => api.sendCommand(sessionId, code, value);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {label} Cue
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS[prefix === "2" ? "CUE_2" : "CUE"]}</span>
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(codes.arm); updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(codes.disarm); updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(codes.test)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Freq (Hz):</label>
        <input type="number" value={frequency} min={1} max={65535}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], frequency: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(codes.freq, frequency)}
          disabled={frequency < 1 || frequency > 65535}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Dur (ms):</label>
        <input type="number" value={duration} min={1} max={600000}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], duration: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(codes.dur, duration)}
          disabled={duration < 1 || duration > 600000}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
