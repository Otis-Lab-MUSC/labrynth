import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { asUpload, showInvalid } from "../../lib/cardSet";
import { FieldUpload } from "./FieldUpload";
import type { CardField } from "../../lib/cardSet";
import { CardHeader } from "./CardHeader";
import { MissingSettingsNote } from "./MissingSettingsNote";

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
  const freqValid = laserFrequency !== null && laserFrequency >= 1 && laserFrequency <= 65535;
  const durValid = laserDuration !== null && laserDuration >= 1 && laserDuration <= 600000;
  const freqField: CardField = { code: 1102, value: laserFrequency ?? 0, valid: freqValid, label: "Laser Freq (Hz)", required: true };
  const durField: CardField = { code: 1103, value: laserDuration ?? 0, valid: durValid, label: "Laser Dur (ms)", required: true };
  const setFields: CardField[] = [freqField, durField];

  return (
    <div className="card">
      <CardHeader
        sessionId={sessionId}
        cardId="slm"
        title="SLM Sync"
        pinComponent="slm"
        uploads={setFields.map(asUpload)}
        armed={armed}
      />
      <MissingSettingsNote armed={armed} fields={setFields} />
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
          className={`flex-1 input-base${showInvalid(armed, freqValid) ? " border-red-500" : ""}`}
        />
        <FieldUpload sessionId={sessionId} cardId="slm" field={asUpload(freqField)} send={send} armed={armed} />
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
          className={`flex-1 input-base${showInvalid(armed, durValid) ? " border-red-500" : ""}`}
        />
        <FieldUpload sessionId={sessionId} cardId="slm" field={asUpload(durField)} send={send} armed={armed} />
      </div>
    </div>
  );
}
