import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import type { AuxUiState } from "../../types";
import { asUpload, invalidLabels, showInvalid, uploadState } from "../../lib/cardSet";
import { uploadKey, useCardSyncStore } from "../../store/useCardSyncStore";
import { FieldUpload } from "./FieldUpload";
import type { CardField } from "../../lib/cardSet";
import { CardHeader } from "./CardHeader";
import { MissingSettingsNote } from "./MissingSettingsNote";
import { MenuButton } from "./MenuButton";
import {
  AUX_ARM, AUX_DISARM, AUX_TEST, AUX_SET_DURATION, AUX_SET_ONSET_DELAY, AUX_SET_MODE,
  AUX_SET_PROBABILITY, AUX_SET_BLOCK_K, AUX_SET_BLOCK_N, AUX_SET_SEED, AUX_SET_TEST_FIRE,
  AUX_MODE_HELP, SHOCK_LABEL, auxCommandsFor, blockSummary, confirmAuxAction,
  isAuxConfigured, isValidBlockK, isValidBlockN, isValidDuration, isValidMode, isValidOnsetDelay,
  isValidProbability, isValidSeed,
} from "../../lib/auxOutput";

interface Props {
  sessionId: string;
}

const AUX_MODE_OPTIONS = [
  { value: 0, label: "Independent" },
  { value: 1, label: "Block" },
] as const;

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

  const sigs = useCardSyncStore((s) => s.sigs);
  const record = useCardSyncStore((s) => s.record);
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
  // What the firmware needs before it will arm (AuxOutput.h Configured()): duration, plus the
  // mode's own setting. Mode, onset delay and seed have safe defaults, so they never warn.
  const isRequired = (code: number) =>
    code === AUX_SET_DURATION || code === AUX_SET_PROBABILITY || code === AUX_SET_BLOCK_N || code === AUX_SET_BLOCK_K;
  const setFields: CardField[] = auxCommandsFor(aux).map(([code, value]) => ({
    code, value, valid: isValid(code), label: FIELD_LABEL[code], required: isRequired(code),
  }));

  // Test-mode pulses and the mode send the moment they are picked, so they get no upload button
  // and are not counted.
  const uploads = setFields.filter((f) => f.code !== AUX_SET_TEST_FIRE && f.code !== AUX_SET_MODE).map(asUpload);
  const modeKey = uploadKey(sessionId, "aux", String(AUX_SET_MODE));
  const modeSig = (mode: number) => JSON.stringify([[AUX_SET_MODE, mode]]);
  const byCode = (code: number) => uploads.find((u) => u.fields[0].code === code);
  const requiredUploaded = (all: Record<string, string>) => uploads
    .filter((u) => u.required)
    .every((u) => uploadState(u, all[uploadKey(sessionId, "aux", u.id)] ?? null) === "synced");
  const isBoardReady = isAuxConfigured(aux) && requiredUploaded(sigs);
  // Same check for a mode just picked, before the card re-renders with it.
  const requiredUploadedFor = (mode: 0 | 1, all: Record<string, string>) =>
    auxCommandsFor({ ...aux, mode }).filter(([code]) => isRequired(code)).every(([code, value]) =>
      all[uploadKey(sessionId, "aux", String(code))] === JSON.stringify([[code, value]]));

  // The firmware refuses to arm an unconfigured shock, so an early Arm is held until the next sync.
  const handleArm = () => {
    if (isBoardReady) {
      send(AUX_ARM);
      update({ armed: true, armPending: false });
      return;
    }
    update({ armed: true, armPending: true });
  };

  const handleDisarm = () => {
    send(AUX_DISARM);
    update({ armed: false, armPending: false });
  };

  // The board counts as configured once the required settings are uploaded; a held Arm then goes out.
  // The board forgets the mode on a reconnect (it reboots to Independent), so a mode the board
  // does not hold is sent again here, before the shock counts as configured or a held Arm goes out.
  const handleSent = async () => {
    const all = useCardSyncStore.getState().sigs;
    if (!requiredUploaded(all)) return;
    if (all[modeKey] !== modeSig(aux.mode)) {
      try {
        await send(AUX_SET_MODE, aux.mode);
        record(modeKey, modeSig(aux.mode));
      } catch (err) {
        update({ lastError: `Mode not sent: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }
    }
    update({ configSent: true, lastError: undefined, armPending: false });
    if (aux.armPending) send(AUX_ARM);
  };

  const upload = (code: number) => {
    const field = byCode(code);
    return field ? <FieldUpload sessionId={sessionId} cardId="aux" field={field} send={send} armed={aux.armed} onSent={handleSent} /> : null;
  };

  const handleTest = () => {
    if (!confirmAuxAction("test")) return;
    send(AUX_TEST);
  };

  const handleTestFire = () => {
    const testFire = !aux.testFire;
    send(AUX_SET_TEST_FIRE, testFire ? 1 : 0);
    update({ testFire });
  };

  // Picking a mode sends it at once. Start does not re-send the shock, so it must reach the board here.
  const handleMode = async (mode: 0 | 1) => {
    edit({ mode });
    const pending = send(AUX_SET_MODE, mode);
    if (!pending) return;
    try {
      await pending;
      record(modeKey, modeSig(mode));
      // Switching back to a mode whose settings are already on the board leaves it configured.
      const ready = isAuxConfigured({ ...aux, mode }) && requiredUploadedFor(mode, useCardSyncStore.getState().sigs);
      update(ready ? { configSent: true, lastError: undefined } : { lastError: undefined });
      if (ready && aux.armed && aux.armPending) {
        send(AUX_ARM);
        update({ armPending: false });
      }
    } catch (err) {
      update({ lastError: `Mode not sent: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const numberRow = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    valid: boolean,
    code: number,
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
        className={`flex-1 input-base${isRequired(code) && showInvalid(aux.armed, valid) ? " border-red-500" : ""}`}
      />
      {upload(code)}
    </div>
  );

  return (
    <div className="card">
      <CardHeader
        sessionId={sessionId}
        cardId="aux"
        title={SHOCK_LABEL}
        pinComponent="aux"
        uploads={uploads}
        armed={aux.armed}
      />
      <MissingSettingsNote armed={aux.armed} fields={setFields} />
      {aux.armed && aux.armPending && invalidLabels(setFields.filter((f) => f.required)).length === 0 && (
        <p className="text-xs text-amber-400" role="status">Upload the required settings to arm the shock on the board.</p>
      )}
      {aux.lastError && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <span>{aux.lastError}</span>
          <button onClick={() => update({ lastError: undefined })} className="btn-sm" aria-label="Dismiss">✕</button>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleArm}
          className={`btn-sm ${aux.armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={handleDisarm}
          className={`btn-sm ${!aux.armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button
          onClick={handleTest}
          className="btn-sm bg-accent text-accent-contrast"
        >Test Pulse</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm w-36 text-theme-text/60">Mode:</label>
        <MenuButton
          value={aux.mode}
          options={AUX_MODE_OPTIONS}
          onSelect={handleMode}
          title="Picking a mode sends it to the board"
          logId="aux-mode"
        />
      </div>
      <p className="text-xs text-theme-text/60">{AUX_MODE_HELP[aux.mode]}</p>
      {aux.mode === 0 ? (
        numberRow("Probability (%)", aux.probability, (v) => edit({ probability: v }),
          isValidProbability(aux.probability), AUX_SET_PROBABILITY, { min: 0, max: 100, placeholder: "0-100" })
      ) : (
        <>
          {numberRow("Rewards per block (N)", aux.blockN, (v) => edit({ blockN: v }),
            isValidBlockN(aux.blockN), AUX_SET_BLOCK_N, { min: 1, max: 100, placeholder: "1-100" })}
          {numberRow("Shocks per block (K)", aux.blockK, (v) => edit({ blockK: v }),
            isValidBlockK(aux.blockK, aux.blockN), AUX_SET_BLOCK_K, { min: 0, max: aux.blockN, placeholder: "0..N" })}
          <p className="text-xs text-theme-text/60">{blockSummary(aux.blockK, aux.blockN)}</p>
        </>
      )}
      {numberRow("Duration (ms)", aux.duration, (v) => edit({ duration: v }),
        isValidDuration(aux.duration), AUX_SET_DURATION, { min: 1, max: 5000, placeholder: "1-5000" })}
      {numberRow("Onset delay (ms)", aux.onsetDelay, (v) => edit({ onsetDelay: v }),
        isValidOnsetDelay(aux.onsetDelay), AUX_SET_ONSET_DELAY, { min: 0, placeholder: "0" })}
      {numberRow("Seed (0 = auto)", aux.seed, (v) => edit({ seed: v }),
        isValidSeed(aux.seed), AUX_SET_SEED, { min: 0, placeholder: "blank = auto", blankIsZero: true })}
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
