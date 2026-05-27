import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";
import { HintIcon } from "../tutorial/HintIcon";

interface Props {
  sessionId: string;
  label: string;
  prefix: "" | "2";
}

const CODES = {
  "": { arm: 301, disarm: 300, test: 303, freq: 371, dur: 372 },
  "2": { arm: 311, disarm: 310, test: 313, freq: 381, dur: 382 },
};

const STORE_KEY = { "": "primaryCue", "2": "secondaryCue" } as const;

export function CueControl({ sessionId, label, prefix }: Props) {
  const storeKey = STORE_KEY[prefix];
  const cue = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!cue) return null;

  const { armed, frequency, duration } = cue;
  const codes = CODES[prefix];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {label} Cue
        <HintIcon hint="Arm to include this speaker in the session. Test plays the tone immediately." helpSection="configuration.hardware.cues" />
        <PinField sessionId={sessionId} component={prefix === "2" ? "cue2" : "cue"} />
      </h3>
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
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60 inline-flex items-center">Freq (Hz):<HintIcon hint="Tone frequency in Hz. Typical auditory cues use 2000–4000 Hz." helpSection="configuration.hardware.cues" /></label>
        <input type="number" value={frequency} min={1} max={65535}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], frequency: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(codes.freq, frequency)}
          disabled={frequency < 1 || frequency > 65535}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60 inline-flex items-center">Dur (ms):<HintIcon hint="How long the tone plays per cue event in milliseconds." helpSection="configuration.hardware.cues" /></label>
        <input type="number" value={duration} min={1} max={600000}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], duration: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(codes.dur, duration)}
          disabled={duration < 1 || duration > 600000}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
