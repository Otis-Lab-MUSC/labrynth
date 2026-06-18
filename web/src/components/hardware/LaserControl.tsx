import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { LASER_MODE_COMMANDS } from "../program/devicePresets";
import { PinField } from "./PinField";
import { SquareWaveCanvas } from "./SquareWaveCanvas";

interface Props {
  sessionId: string;
  paradigm?: string;
}

export function LaserControl({ sessionId, paradigm }: Props) {
  const laser = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.laser);
  const pavParams = useSessionStore((s) => s.sessions.get(sessionId)?.pavlovianParams);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!laser) return null;

  const { armed, frequency, duration, mode, phase, contingency, onsetDelay } = laser;
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);
  const isPavlovian = paradigm === "pavlovian";

  // In Pavlovian the laser fires within a single trial phase, so cap the onset delay to that
  // phase window (cue=213, consumption=215) — firmware clamps too, this keeps the UI honest (#69).
  const delayMax = isPavlovian
    ? Math.max(0, (phase === "cue" ? (pavParams?.[213] ?? 2000) : (pavParams?.[215] ?? 5000)) - 1)
    : 600000;

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        Laser
        <PinField sessionId={sessionId} component="laser" />
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
      {isPavlovian ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-theme-text/60">Mode:</span>
            <button
              onClick={() => { send(681); send(693); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, mode: "cs_both" } })); }}
              className={`btn-sm ${mode !== "independent" ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
            >Trial-Paired</button>
            <button
              onClick={() => { send(682); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, mode: "independent" } })); }}
              className={`btn-sm ${mode === "independent" ? "bg-purple-500" : "bg-purple-500/40"} text-white`}
            >Independent</button>
          </div>
          {mode !== "independent" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-theme-text/60">Trial Filter:</span>
                <button
                  onClick={() => { send(691); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, mode: "cs_plus" } })); }}
                  className={`btn-sm ${mode === "cs_plus" ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
                >CS+</button>
                <button
                  onClick={() => { send(692); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, mode: "cs_minus" } })); }}
                  className={`btn-sm ${mode === "cs_minus" ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
                >CS-</button>
                <button
                  onClick={() => { send(693); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, mode: "cs_both" } })); }}
                  className={`btn-sm ${mode === "cs_both" ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
                >Both</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-theme-text/60">Phase:</span>
                <button
                  onClick={() => { send(694); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, phase: "reward" } })); }}
                  className={`btn-sm ${phase === "reward" ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
                >Reward</button>
                <button
                  onClick={() => { send(695); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, phase: "cue" } })); }}
                  className={`btn-sm ${phase === "cue" ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
                >Cue</button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-theme-text/60">Contingent on:</span>
          {([
            ["any", "Any", LASER_MODE_COMMANDS.contingent],
            ["rh", "RH", LASER_MODE_COMMANDS.rh_lever],
            ["lh", "LH", LASER_MODE_COMMANDS.lh_lever],
            ["independent", "Independent", LASER_MODE_COMMANDS.independent],
          ] as const).map(([val, label, cmd]) => (
            <button
              key={val}
              onClick={() => { send(cmd); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, contingency: val } })); }}
              className={`btn-sm ${contingency === val ? "bg-purple-600" : "bg-purple-600/40"} text-white`}
            >{label}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60" title="Integer ms timing causes ~2-4% error at 30/40 Hz. Exact at 1, 10, 20, 25, 50 Hz.">Freq (Hz):</label>
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
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60" title="Onset delay from trigger to laser activation">Delay (ms):</label>
        <input type="number" value={onsetDelay} min={0} max={delayMax}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, onsetDelay: Math.min(Math.max(0, +e.target.value), delayMax) } }))}
          className="w-24 input-base" />
        <button onClick={() => send(673, onsetDelay)}
          disabled={onsetDelay < 0 || onsetDelay > delayMax}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <SquareWaveCanvas frequency={frequency} duration={duration} />
    </div>
  );
}
