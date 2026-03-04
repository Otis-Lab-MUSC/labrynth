import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
}

export function MicroscopeControl({ sessionId }: Props) {
  const microscope = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.microscope);
  const armed = microscope?.armed ?? false;
  const frameRate = microscope?.frameRate ?? null;
  const frameAveraging = microscope?.frameAveraging ?? null;
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const send = (code: number) => api.sendCommand(sessionId, code);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        Microscope Sync
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pins {HARDWARE_PINS.MICROSCOPE}</span>
      </h3>
      <div className="flex gap-2">
        <button
          onClick={() => { send(901); updateHardwareUi(sessionId, (prev) => ({ microscope: { ...prev.microscope, armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(900); updateHardwareUi(sessionId, (prev) => ({ microscope: { ...prev.microscope, armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(903)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60">Frame Rate (Hz):</label>
        <input
          type="number"
          min={0}
          value={frameRate ?? ""}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({
            microscope: { ...prev.microscope, frameRate: e.target.value ? Number(e.target.value) : null },
          }))}
          placeholder="e.g. 30"
          className="flex-1 input-base"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60">Frame Averaging:</label>
        <input
          type="number"
          min={1}
          value={frameAveraging ?? ""}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({
            microscope: { ...prev.microscope, frameAveraging: e.target.value ? Number(e.target.value) : null },
          }))}
          placeholder="e.g. 4"
          className="flex-1 input-base"
        />
      </div>
    </div>
  );
}
