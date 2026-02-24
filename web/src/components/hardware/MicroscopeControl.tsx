import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
}

export function MicroscopeControl({ sessionId }: Props) {
  const armed = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.microscope.armed ?? false);
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
          onClick={() => { send(901); updateHardwareUi(sessionId, () => ({ microscope: { armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(900); updateHardwareUi(sessionId, () => ({ microscope: { armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(903)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
    </div>
  );
}
