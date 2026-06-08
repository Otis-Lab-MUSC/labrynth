import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";

interface Props {
  sessionId: string;
}

export function LickCircuitControl({ sessionId }: Props) {
  const armed = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.lickCircuit.armed ?? false);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const send = (code: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        Lick Circuit
        <PinField sessionId={sessionId} component="lick" />
      </h3>
      <div className="flex gap-2">
        <button
          onClick={() => {
            send(501);
            updateHardwareUi(sessionId, (prev) => ({
              lickCircuit: { armed: true },
              primaryCue:    { ...prev.primaryCue,    contingency: { ...prev.primaryCue.contingency,    lickCircuit: true } },
              secondaryCue:  { ...prev.secondaryCue,  contingency: { ...prev.secondaryCue.contingency,  lickCircuit: true } },
              primaryPump:   { ...prev.primaryPump,   contingency: { ...prev.primaryPump.contingency,   lickCircuit: true } },
              secondaryPump: { ...prev.secondaryPump, contingency: { ...prev.secondaryPump.contingency, lickCircuit: true } },
            }));
          }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => {
            send(500);
            updateHardwareUi(sessionId, (prev) => ({
              lickCircuit: { armed: false },
              primaryCue:    { ...prev.primaryCue,    contingency: { ...prev.primaryCue.contingency,    lickCircuit: false } },
              secondaryCue:  { ...prev.secondaryCue,  contingency: { ...prev.secondaryCue.contingency,  lickCircuit: false } },
              primaryPump:   { ...prev.primaryPump,   contingency: { ...prev.primaryPump.contingency,   lickCircuit: false } },
              secondaryPump: { ...prev.secondaryPump, contingency: { ...prev.secondaryPump.contingency, lickCircuit: false } },
            }));
          }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
      </div>
    </div>
  );
}
