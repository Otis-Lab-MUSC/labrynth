import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import type { AuxUiState } from "../../types";
import {
  AUX_ARM, AUX_DISARM, AUX_TEST, AUX_SET_DURATION, AUX_SET_ONSET_DELAY, AUX_SET_MODE,
  AUX_SET_PROBABILITY, AUX_SET_BLOCK_K, AUX_SET_BLOCK_N, AUX_SET_SEED, AUX_SET_TEST_FIRE,
  confirmAuxAction, isValidDuration, isValidOnsetDelay, isValidProbability,
  isValidBlockN, isValidBlockK, isValidSeed,
} from "../../lib/aux";

interface Props {
  sessionId: string;
}

export function AuxOutputControl({ sessionId }: Props) {
  const aux = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.aux);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!aux) return null;

  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);
  const update = (patch: Partial<AuxUiState>) =>
    updateHardwareUi(sessionId, (prev) => ({ aux: { ...prev.aux, ...patch } }));

  const handleArm = () => {
    if (!confirmAuxAction("arm")) return;
    send(AUX_ARM);
    update({ armed: true });
  };

  const handleDisarm = () => {
    send(AUX_DISARM);
    update({ armed: false });
  };

  const handleTest = () => {
    if (!confirmAuxAction("test")) return;
    send(AUX_TEST);
  };

  const handleTestFire = () => {
    if (!aux.testFire) {
      if (!confirmAuxAction("testFire")) return;
      send(AUX_SET_TEST_FIRE, 1);
      update({ testFire: true });
    } else {
      send(AUX_SET_TEST_FIRE, 0);
      update({ testFire: false });
    }
  };

  const handleMode = (mode: 0 | 1) => {
    send(AUX_SET_MODE, mode);
    update({ mode });
  };

  const numberRow = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    code: number,
    valid: boolean,
    opts: { min: number; max?: number; placeholder?: string; blankIsZero?: boolean; title?: string },
  ) => (
    <div className="flex items-center gap-2">
      <label className="text-sm w-36 text-theme-text/60" title={opts.title}>{label}</label>
      <input
        type="number"
        min={opts.min}
        max={opts.max}
        value={opts.blankIsZero && value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? (opts.blankIsZero ? 0 : NaN) : Number(e.target.value))}
        placeholder={opts.placeholder}
        className="flex-1 input-base"
      />
      <button onClick={() => send(code, value)} disabled={!valid}
        className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
    </div>
  );

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Shock Output (AUX)</h3>
      <div className="flex gap-2">
        <button
          onClick={handleArm}
          className={`btn-sm ${aux.armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={handleDisarm}
          className={`btn-sm ${!aux.armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={handleTest} className="btn-sm bg-accent text-accent-contrast">Test Pulse</button>
      </div>
      {numberRow("Duration (ms):", aux.duration, (v) => update({ duration: v }), AUX_SET_DURATION,
        isValidDuration(aux.duration), { min: 1, max: 5000, placeholder: "1-5000" })}
      {numberRow("Onset Delay (ms):", aux.onsetDelay, (v) => update({ onsetDelay: v }), AUX_SET_ONSET_DELAY,
        isValidOnsetDelay(aux.onsetDelay), { min: 0, placeholder: "0" })}
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60">Mode:</label>
        <select
          value={aux.mode}
          onChange={(e) => handleMode(Number(e.target.value) === 1 ? 1 : 0)}
          className="flex-1 input-base"
        >
          <option value={0}>Independent</option>
          <option value={1}>Block</option>
        </select>
      </div>
      {aux.mode === 0 ? (
        numberRow("Probability (%):", aux.probability, (v) => update({ probability: v }), AUX_SET_PROBABILITY,
          isValidProbability(aux.probability), { min: 0, max: 100, placeholder: "0-100" })
      ) : (
        <>
          {numberRow("Block N:", aux.blockN, (v) => update({ blockN: v }), AUX_SET_BLOCK_N,
            isValidBlockN(aux.blockN), { min: 1, max: 100, placeholder: "1-100", title: "Rewards per block" })}
          {numberRow("Block K:", aux.blockK, (v) => update({ blockK: v }), AUX_SET_BLOCK_K,
            isValidBlockK(aux.blockK, aux.blockN), { min: 0, max: aux.blockN, placeholder: "0..N", title: "Shocked rewards per block" })}
        </>
      )}
      {numberRow("Seed:", aux.seed, (v) => update({ seed: v }), AUX_SET_SEED,
        isValidSeed(aux.seed), { min: 0, placeholder: "blank = auto", blankIsZero: true })}
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60" title="Allow pulses during test mode / TEST_CHAIN">Test-mode pulses:</label>
        <button
          onClick={handleTestFire}
          className={`btn-sm ${aux.testFire ? "btn-toggle-red-on" : "btn-toggle-green-off"}`}
        >{aux.testFire ? "Allowed" : "Blocked"}</button>
      </div>
    </div>
  );
}
