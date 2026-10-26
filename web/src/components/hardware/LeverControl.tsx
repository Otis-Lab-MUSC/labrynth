import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";
import { CardHeader } from "./CardHeader";
import { isParadigm } from "../../lib/paradigm";
import { useFirmwareCommands } from "../../hooks/useFirmwareCommands";
import { firstInvalid, showInvalid } from "../../lib/cardSet";
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

  const setFields: CardField[] = [];
  if (showTimeout) setFields.push({ code: codes.timeout, value: timeout, valid: timeout >= 0 && timeout <= 600000, label: "Timeout (ms)" });
  if (showTimeoutMode) setFields.push({ code: codes.timeoutMode, value: timeoutMode, valid: true, label: "Timeout starts on" });

  const invalid = firstInvalid(setFields);

  return (
    <div className="card">
      <CardHeader
        sessionId={sessionId}
        cardId={`lever${side}`}
        title={<>{side} Lever <PinField sessionId={sessionId} component={side === "RH" ? "lever_rh" : "lever_lh"} /></>}
        label="SET"
        fields={setFields}
        send={send}
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(codes.arm); updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], armed: true } })); }}
          disabled={invalid !== null}
          title={invalid !== null ? `Fix ${invalid} first` : undefined}
          className={`btn-sm disabled:opacity-50 ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
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
            className={`w-24 input-base ${showInvalid(armed, timeout >= 0 && timeout <= 600000) ? "border-red-500" : ""}`}
          />
        </div>
      )}
      {showTimeoutMode && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Timeout starts on:</label>
          <select
            value={timeoutMode}
            data-log-id={`lever-${side}-timeout-mode`}
            onChange={(e) => setShared({ timeoutMode: +e.target.value })}
            className="input-base"
          >
            {TIMEOUT_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
