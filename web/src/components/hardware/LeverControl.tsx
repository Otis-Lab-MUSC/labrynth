import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { CardHeader } from "./CardHeader";
import { MissingSettingsNote } from "./MissingSettingsNote";
import { isParadigm } from "../../lib/paradigm";
import { useFirmwareCommands } from "../../hooks/useFirmwareCommands";
import { type UploadField } from "../../lib/cardSet";
import { FieldUpload } from "./FieldUpload";
import { MenuButton } from "./MenuButton";
import { canSendNow } from "../../lib/sendGate";
import type { CardField } from "../../lib/cardSet";

interface Props {
  sessionId: string;
  side: "RH" | "LH";
  paradigm?: string;
}

const CODES = {
  RH: { arm: 1001, disarm: 1000, timeout: 1074, timeoutMode: 1077, inactive: 1080, active: 1081 },
  LH: { arm: 1301, disarm: 1300, timeout: 1374, timeoutMode: 1377, inactive: 1380, active: 1381 },
};

/** Timeout-mode values, mirroring the firmware scheduler's TIMEOUT_MODE_* constants. */
const TIMEOUT_MODE_OPTIONS = [
  { value: 0, label: "Every active press" },
  { value: 1, label: "Reward-triggering press only" },
] as const;

const STORE_KEY = { RH: "rhLever", LH: "lhLever" } as const;

export function LeverControl({ sessionId, side, paradigm }: Props) {
  const storeKey = STORE_KEY[side];
  const lever = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const sessionState = useSessionStore((s) => s.sessions.get(sessionId)?.state);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const { has } = useFirmwareCommands(sessionId);

  if (!lever) return null;

  const { armed, timeout, timeoutMode } = lever;
  const codes = CODES[side];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  // Fix: the raw string compares this gate used to do still matched "omission_lite"
  // as a timeout-capable paradigm, so the Timeout row rendered on lite omission
  // boards that have no lever timeout at all. isParadigm() strips the _lite suffix.
  // Timeout and timeout mode are scheduler-wide in firmware (1074/1374 write one register,
  // 1077/1377 one flag), so an edit on either card is mirrored into both levers' fields.
  const setShared = (patch: { timeout?: number; timeoutMode?: number }) =>
    updateHardwareUi(sessionId, (prev) => ({
      rhLever: { ...prev.rhLever, ...patch },
      lhLever: { ...prev.lhLever, ...patch },
    }));

  // Whether the firmware takes a timeout at all is answered by its command list; the
  // name fallback covers the moments before a board answers. VI and omission declare
  // the timeout but their schedules have no post-reward lockout: VI's reward is gated
  // by the availability window (the dispatch path pins its timeout to 0, see
  // leverSchedulerCommands) and omission ignores it (INTENTIONALLY_UNHANDLED in reacher).
  const showTimeout =
    (has(codes.timeout) ?? !isParadigm(paradigm, "pavlovian")) && !isParadigm(paradigm, "omission", "vi");
  // Must never outlive showTimeout: a mode for a hidden timeout is meaningless.
  const showTimeoutMode = showTimeout && (has(codes.timeoutMode) ?? isParadigm(paradigm, "fr", "pr"));

  // Both levers write one scheduler register, so the upload is remembered once for the pair
  // (scope "levers") and compared on the value alone: uploading from RH clears LH's amber too.
  const shared = (id: string, field: CardField): UploadField => ({
    id, label: field.label ?? id, fields: [field], scope: "levers", signature: JSON.stringify(field.value),
  });
  const timeoutUpload = shared("timeout", { code: codes.timeout, value: timeout, valid: timeout >= 0 && timeout <= 600000, label: "Timeout (ms)" });
  const uploads: UploadField[] = [];
  if (showTimeout) uploads.push(timeoutUpload);
  const setFields = uploads.flatMap((u) => u.fields);
  const cardId = `lever${side}`;

  // Picking a mode saves it and, while a board is attached, sends it. Start sends it again.
  const handleTimeoutMode = async (value: number) => {
    setShared({ timeoutMode: value });
    if (canSendNow(sessionState)) await send(codes.timeoutMode, value)?.catch(() => undefined);
  };


  return (
    <div className="card">
      <CardHeader
        sessionId={sessionId}
        cardId={cardId}
        title={`${side} Lever`}
        pinComponent={side === "RH" ? "lever_rh" : "lever_lh"}
        uploads={uploads}
        armed={armed}
      />
      <MissingSettingsNote armed={armed} fields={setFields} />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(codes.arm); updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(codes.disarm); updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
      </div>
      {showTimeout && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Timeout (ms):</label>
          <input
            type="number" value={timeout} min={0} max={600000}
            onChange={(e) => setShared({ timeout: +e.target.value })}
            className="w-24 input-base"
          />
          <FieldUpload sessionId={sessionId} cardId={cardId} field={timeoutUpload} send={send} armed={armed} />
        </div>
      )}
      {showTimeoutMode && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Timeout starts on:</label>
          <MenuButton
            value={timeoutMode}
            options={TIMEOUT_MODE_OPTIONS}
            onSelect={handleTimeoutMode}
            title="Picking a mode sends it to the board"
            logId={`lever-${side}-timeout-mode`}
          />
        </div>
      )}
      {showTimeout && (
        <p className="text-xs text-theme-text/50">
          Scheduler-wide: timeout and timeout mode are shared by both levers.
        </p>
      )}
    </div>
  );
}
