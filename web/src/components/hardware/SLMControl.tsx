import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";

interface Props {
  sessionId: string;
}

export function SLMControl({ sessionId }: Props) {
  const armed = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.slm.armed ?? false);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const send = (code: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        SLM Sync
        <span className="ml-2 text-xs font-mono text-theme-text/40">PCINT0 pins 8–13</span>
        <PinField sessionId={sessionId} component="slm" />
      </h3>
      <div className="flex gap-2">
        <button
          onClick={() => { send(1101); updateHardwareUi(sessionId, (prev) => ({ slm: { ...prev.slm, armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(1100); updateHardwareUi(sessionId, (prev) => ({ slm: { ...prev.slm, armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
      </div>
    </div>
  );
}
