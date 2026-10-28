import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { CardHeader } from "./CardHeader";

interface Props {
  sessionId: string;
}

export function LickCircuitControl({ sessionId }: Props) {
  const armed = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.lickCircuit.armed ?? false);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const send = (code: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code);

  return (
    <div className="card">
      <CardHeader
        sessionId={sessionId}
        cardId="lick"
        title="Lick Circuit"
        pinComponent="lick"
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            send(501);
            updateHardwareUi(sessionId, () => ({ lickCircuit: { armed: true } }));
          }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => {
            send(500);
            updateHardwareUi(sessionId, () => ({ lickCircuit: { armed: false } }));
          }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
      </div>
    </div>
  );
}
