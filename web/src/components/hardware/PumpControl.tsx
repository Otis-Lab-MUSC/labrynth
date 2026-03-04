import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
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

const STORE_KEY = { "": "primaryPump", "2": "secondaryPump" } as const;

const MIN_DURATION = 1;
const MAX_DURATION = 600000;
const clampDuration = (ms: number) => Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(ms)));

export function PumpControl({ sessionId, label, prefix }: Props) {
  const storeKey = STORE_KEY[prefix];
  const pump = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!pump) return null;

  const { armed, duration, flowRate, volume } = pump;
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => api.sendCommand(sessionId, code, value);
  const hasFlowRate = flowRate != null && flowRate > 0;

  const update = (patch: Partial<typeof pump>) =>
    updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], ...patch } }));

  const onFlowRateChange = (raw: string) => {
    const fr = raw === "" ? null : parseFloat(raw);
    if (fr == null || isNaN(fr) || fr <= 0) {
      update({ flowRate: null, volume: null });
    } else {
      update({ flowRate: fr, volume: (duration / 1000) * fr });
    }
  };

  const onVolumeChange = (raw: string) => {
    if (!hasFlowRate) return;
    const v = parseFloat(raw);
    if (isNaN(v) || v < 0) return;
    const newDuration = clampDuration((v / flowRate!) * 1000);
    update({ volume: v, duration: newDuration });
  };

  const onDurationChange = (raw: string) => {
    const d = +raw;
    if (hasFlowRate) {
      update({ duration: d, volume: (d / 1000) * flowRate! });
    } else {
      update({ duration: d });
    }
  };

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {label} Pump
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS[prefix === "2" ? "PUMP_2" : "PUMP"]}</span>
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
        <label className="text-sm text-theme-text/60">Flow Rate ({"\u00B5"}L/s):</label>
        <input type="number" value={flowRate ?? ""} min={0} step="any"
          onChange={(e) => onFlowRateChange(e.target.value)}
          placeholder="From pump spec"
          className="w-28 input-base" />
      </div>
      {hasFlowRate && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Volume ({"\u00B5"}L):</label>
          <input type="number" value={volume ?? ""} min={0} step="any"
            onChange={(e) => onVolumeChange(e.target.value)}
            className="w-24 input-base" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Duration (ms):</label>
        <input type="number" value={duration} min={MIN_DURATION} max={MAX_DURATION}
          onChange={(e) => onDurationChange(e.target.value)}
          className="w-24 input-base" />
        <button onClick={() => send(codes.dur, duration)}
          disabled={duration < MIN_DURATION || duration > MAX_DURATION}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
