import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
}

export function LaserControl({ sessionId }: Props) {
  const laser = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.laser);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!laser) return null;

  const { armed, frequency, duration } = laser;
  const send = (code: number, value?: number) => api.sendCommand(sessionId, code, value);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        Laser
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS.LASER}</span>
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(601); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(600); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(603)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => send(681)} className="btn-sm bg-purple-600 text-white">Contingent</button>
        <button onClick={() => send(682)} className="btn-sm bg-purple-500 text-white">Independent</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Freq (Hz):</label>
        <input type="number" value={frequency} min={1} max={65535}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, frequency: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(671, frequency)}
          disabled={frequency < 1 || frequency > 65535}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Dur (ms):</label>
        <input type="number" value={duration} min={1} max={600000}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, duration: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(672, duration)}
          disabled={duration < 1 || duration > 600000}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
