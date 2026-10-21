import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import type { AuxUiState } from "../../types";
import type { CardField } from "../../lib/cardSet";
import { CardSetButton } from "./CardSetButton";
import { PinField } from "./PinField";
import {
  AUX_ARM, AUX_DISARM, AUX_TEST, AUX_SET_DURATION, AUX_SET_ONSET_DELAY, AUX_SET_MODE,
  AUX_SET_PROBABILITY, AUX_SET_BLOCK_K, AUX_SET_BLOCK_N, AUX_SET_SEED, AUX_SET_TEST_FIRE,
  AUX_MODE_HELP, SHOCK_LABEL, auxCommandsFor, auxStatusText, blockSummary, confirmAuxAction,
  isAuxConfigured, isValidBlockK, isValidBlockN, isValidDuration, isValidMode, isValidOnsetDelay,
  isValidProbability, isValidSeed,
} from "../../lib/auxOutput";

interface Props {
  sessionId: string;
}

const FIELD_LABEL: Record<number, string> = {
  [AUX_SET_MODE]: "Mode",
  [AUX_SET_PROBABILITY]: "Probability (%)",
  [AUX_SET_BLOCK_N]: "Rewards per block (N)",
  [AUX_SET_BLOCK_K]: "Shocks per block (K)",
  [AUX_SET_DURATION]: "Duration (ms)",
  [AUX_SET_ONSET_DELAY]: "Onset delay (ms)",
  [AUX_SET_SEED]: "Seed (0 = auto)",
  [AUX_SET_TEST_FIRE]: "Test-mode pulses",
};

export function AuxOutputControl({ sessionId }: Props) {
  const aux = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.aux);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!aux) return null;

  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);
  const update = (patch: Partial<AuxUiState>) =>
    updateHardwareUi(sessionId, (prev) => ({ aux: { ...prev.aux, ...patch } }));
  const edit = (patch: Partial<AuxUiState>) => update({ ...patch, configSent: false });

  const isValid = (code: number) => {
    switch (code) {
      case AUX_SET_MODE: return isValidMode(aux.mode);
      case AUX_SET_PROBABILITY: return isValidProbability(aux.probability);
      case AUX_SET_BLOCK_N: return isValidBlockN(aux.blockN);
      case AUX_SET_BLOCK_K: return isValidBlockK(aux.blockK, aux.blockN);
      case AUX_SET_DURATION: return isValidDuration(aux.duration);
      case AUX_SET_ONSET_DELAY: return isValidOnsetDelay(aux.onsetDelay);
      case AUX_SET_SEED: return isValidSeed(aux.seed);
      default: return true;
    }
  };
  const setFields: CardField[] = auxCommandsFor(aux).map(([code, value]) => ({
    code, value, valid: isValid(code), label: FIELD_LABEL[code],
  }));

  const canArm = isAuxConfigured(aux) && aux.configSent;
  const canTest = isAuxConfigured(aux) && aux.configSent;

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

  const handleMode = (mode: 0 | 1) => edit({ mode });

  const numberRow = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    valid: boolean,
    opts: { min: number; max?: number; placeholder?: string; blankIsZero?: boolean },
  ) => (
    <div className="flex items-center gap-2">
      <label className="text-sm w-36 text-theme-text/60">{label}</label>
      <input
        type="number"
        min={opts.min}
        max={opts.max}
        value={opts.blankIsZero && value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? (opts.blankIsZero ? 0 : NaN) : Number(e.target.value))}
        placeholder={opts.placeholder}
        className={`flex-1 input-base${valid ? "" : " border-red-500"}`}
      />
    </div>
  );

  return (
    <div className="card">
      <div className="flex items-baseline gap-2">
        <h3 className="font-medium text-theme-text">
          {SHOCK_LABEL}
          <PinField sessionId={sessionId} component="aux" />
        </h3>
        <span className={`text-xs ${aux.armed ? "text-red-500 font-semibold" : "text-theme-text/60"}`}>
          {auxStatusText(aux.armed)}
        </span>
      </div>
      {aux.lastError && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <span>{aux.lastError}</span>
          <button onClick={() => update({ lastError: undefined })} className="btn-sm" aria-label="Dismiss">✕</button>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleArm}
          disabled={!canArm}
          title={canArm ? undefined : "Set the shock settings first"}
          className={`btn-sm ${aux.armed ? "btn-toggle-green-on" : "btn-toggle-green-off"} disabled:opacity-50`}
        >Arm</button>
        <button
          onClick={handleDisarm}
          className={`btn-sm ${!aux.armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button
          onClick={handleTest}
          disabled={!canTest}
          title={canTest ? undefined : "Set the shock settings first"}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50"
        >Test Pulse</button>
      </div>
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
      <p className="text-xs text-theme-text/60">{AUX_MODE_HELP[aux.mode]}</p>
      {aux.mode === 0 ? (
        numberRow("Probability (%)", aux.probability, (v) => edit({ probability: v }),
          isValidProbability(aux.probability), { min: 0, max: 100, placeholder: "0-100" })
      ) : (
        <>
          {numberRow("Rewards per block (N)", aux.blockN, (v) => edit({ blockN: v }),
            isValidBlockN(aux.blockN), { min: 1, max: 100, placeholder: "1-100" })}
          {numberRow("Shocks per block (K)", aux.blockK, (v) => edit({ blockK: v }),
            isValidBlockK(aux.blockK, aux.blockN), { min: 0, max: aux.blockN, placeholder: "0..N" })}
          <p className="text-xs text-theme-text/60">{blockSummary(aux.blockK, aux.blockN)}</p>
        </>
      )}
      {numberRow("Duration (ms)", aux.duration, (v) => edit({ duration: v }),
        isValidDuration(aux.duration), { min: 1, max: 5000, placeholder: "1-5000" })}
      {numberRow("Onset delay (ms)", aux.onsetDelay, (v) => edit({ onsetDelay: v }),
        isValidOnsetDelay(aux.onsetDelay), { min: 0, placeholder: "0" })}
      {numberRow("Seed (0 = auto)", aux.seed, (v) => edit({ seed: v }),
        isValidSeed(aux.seed), { min: 0, placeholder: "blank = auto", blankIsZero: true })}
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60" title="Allow pulses during test mode / TEST_CHAIN">Test-mode pulses:</label>
        <button
          onClick={handleTestFire}
          className={`btn-sm ${aux.testFire ? "btn-toggle-red-on" : "btn-toggle-green-off"}`}
        >{aux.testFire ? "Allowed" : "Blocked"}</button>
      </div>
      <div className="flex justify-end">
        <CardSetButton fields={setFields} send={send} onSent={() => update({ configSent: true, lastError: undefined })} />
      </div>
    </div>
  );
}
