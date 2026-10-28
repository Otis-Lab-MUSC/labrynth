import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { ContingencySection } from "./ContingencySection";
import { CardHeader } from "./CardHeader";
import { MissingSettingsNote } from "./MissingSettingsNote";
import { showInvalid } from "../../lib/cardSet";
import type { CardField } from "../../lib/cardSet";
import { getDelayUpload } from "./contingencyFields";
import { FieldUpload } from "./FieldUpload";
import { asUpload } from "../../lib/cardSet";

interface Props {
  sessionId: string;
  label: string;
  prefix: "" | "2";
  paradigm?: string;
}

const CODES = {
  "": { arm: 301, disarm: 300, test: 303, freq: 371, dur: 372 },
  "2": { arm: 311, disarm: 310, test: 313, freq: 381, dur: 382 },
};

const STORE_KEY = { "": "primaryCue", "2": "secondaryCue" } as const;

export function CueControl({ sessionId, label, prefix, paradigm }: Props) {
  const storeKey = STORE_KEY[prefix];
  const cue = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!cue) return null;

  const { armed, frequency, duration } = cue;
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);
  // Pavlovian freq/duration are owned by PavlovianSettings (commands 210/211/213); hide here to avoid duplicates.
  const showFreqDur = paradigm !== "pavlovian";
  const freqValid = frequency >= 1 && frequency <= 65535;
  const durValid = duration >= 1 && duration <= 600000;

  const freqField: CardField = { code: codes.freq, value: frequency, valid: freqValid, label: "Freq (Hz)", required: true };
  const durField: CardField = { code: codes.dur, value: duration, valid: durValid, label: "Dur (ms)", required: true };
  const uploads = showFreqDur ? [asUpload(freqField), asUpload(durField)] : [];
  const delayUpload = getDelayUpload(storeKey, cue.contingency.delay);
  if (delayUpload) uploads.push(delayUpload);
  const fields = uploads.flatMap((u) => u.fields);
  const cardId = `cue${prefix}`;

  return (
    <div className="card">
      <CardHeader
        sessionId={sessionId}
        cardId={cardId}
        title={`Cue ${label}`}
        pinComponent={prefix === "2" ? "cue2" : "cue"}
        uploads={uploads}
        armed={armed}
      />
      <MissingSettingsNote armed={armed} fields={fields} />
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
      {showFreqDur && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Freq (Hz):</label>
          <input type="number" value={frequency} min={1} max={65535}
            onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], frequency: +e.target.value } }))}
            className={`w-24 input-base${showInvalid(armed, freqValid) ? " border-red-500" : ""}`} />
          <FieldUpload sessionId={sessionId} cardId={cardId} field={asUpload(freqField)} send={send} armed={armed} />
        </div>
      )}
      {showFreqDur && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Dur (ms):</label>
          <input type="number" value={duration} min={1} max={600000}
            onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], duration: +e.target.value } }))}
            className={`w-24 input-base${showInvalid(armed, durValid) ? " border-red-500" : ""}`} />
          <FieldUpload sessionId={sessionId} cardId={cardId} field={asUpload(durField)} send={send} armed={armed} />
        </div>
      )}
      <ContingencySection sessionId={sessionId} deviceKey={storeKey} paradigm={paradigm} />
    </div>
  );
}
