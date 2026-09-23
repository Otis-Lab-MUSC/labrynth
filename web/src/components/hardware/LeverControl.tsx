import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { PinField } from "./PinField";
import { isParadigm } from "../../lib/paradigm";

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

  if (!lever) return null;

  const { armed, timeout, timeoutMode } = lever;
  const codes = CODES[side];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  // Fix: the raw string compares this gate used to do still matched "omission_lite"
  // as a timeout-capable paradigm, so the Timeout row rendered on lite omission
  // boards that have no lever timeout at all. isParadigm() strips the _lite suffix.
  const showTimeout = !isParadigm(paradigm, "omission", "pavlovian");
  // Timeout mode is only declared for fr/pr/vi (+ _lite twins) — omission and
  // pavlovian firmware have no lever timeout, so the control is absent rather
  // than disabled. Must never outlive showTimeout: a mode for a hidden timeout
  // is meaningless.
  const showTimeoutMode = showTimeout && isParadigm(paradigm, "fr", "pr", "vi");

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {side} Lever
        <PinField sessionId={sessionId} component={side === "RH" ? "lever_rh" : "lever_lh"} />
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
      </div>
      {showTimeout && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Timeout (ms):</label>
          <input
            type="number" value={timeout} min={0} max={600000}
            onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], timeout: +e.target.value } }))}
            className="w-24 input-base"
          />
          <button onClick={() => send(codes.timeout, timeout)}
            disabled={timeout < 0 || timeout > 600000}
            className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
        </div>
      )}
      {showTimeoutMode && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Timeout starts on:</label>
          <select
            value={timeoutMode}
            data-log-id={`lever-${side}-timeout-mode`}
            onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], timeoutMode: +e.target.value } }))}
            className="input-base"
          >
            {TIMEOUT_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => send(codes.timeoutMode, timeoutMode)}
            className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
        </div>
      )}
    </div>
  );
}
