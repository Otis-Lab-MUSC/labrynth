import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";

interface Props {
  sessionId: string;
}

export function SLMControl({ sessionId }: Props) {
  const slm = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.slm);
  const armed = slm?.armed ?? false;
  const laserFrequency = slm?.laserFrequency ?? null;
  const laserDuration = slm?.laserDuration ?? null;
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        SLM Sync
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
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60" title="Bookkeeping only — not tied to the LASER device's actual state">Laser Freq (Hz):</label>
        <input
          type="number"
          min={1}
          max={65535}
          value={laserFrequency ?? ""}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({
            slm: { ...prev.slm, laserFrequency: e.target.value ? Number(e.target.value) : null },
          }))}
          placeholder="e.g. 40"
          className="flex-1 input-base"
        />
        <button onClick={() => send(1102, laserFrequency ?? undefined)}
          disabled={laserFrequency === null || laserFrequency < 1 || laserFrequency > 65535}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60" title="Bookkeeping only — not tied to the LASER device's actual state">Laser Dur (ms):</label>
        <input
          type="number"
          min={1}
          max={600000}
          value={laserDuration ?? ""}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({
            slm: { ...prev.slm, laserDuration: e.target.value ? Number(e.target.value) : null },
          }))}
          placeholder="e.g. 5000"
          className="flex-1 input-base"
        />
        <button onClick={() => send(1103, laserDuration ?? undefined)}
          disabled={laserDuration === null || laserDuration < 1 || laserDuration > 600000}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
