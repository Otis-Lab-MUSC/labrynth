import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { HARDWARE_PINS } from "./pins";

interface Props {
  sessionId: string;
  side: "RH" | "LH";
  paradigm?: string;
}

const CODES = {
  RH: { arm: 1001, disarm: 1000, timeout: 1074, ratio: 1075, inactive: 1080, active: 1081 },
  LH: { arm: 1301, disarm: 1300, timeout: 1374, ratio: 1375, inactive: 1380, active: 1381 },
};

const STORE_KEY = { RH: "rhLever", LH: "lhLever" } as const;

export function LeverControl({ sessionId, side, paradigm }: Props) {
  const storeKey = STORE_KEY[side];
  const lever = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[storeKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!lever) return null;

  const { armed, timeout, ratio } = lever;
  const codes = CODES[side];
  const send = (code: number, value?: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  const showActiveInactive = paradigm !== "pavlovian";
  const showTimeout = paradigm !== "omission" && paradigm !== "pavlovian";
  const showRatio = paradigm === "fr" || paradigm === "pr";

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        {side} Lever
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS[`LEVER_${side}`]}</span>
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
        {showActiveInactive && (
          <>
            <button onClick={() => send(codes.active)} className="btn-sm bg-blue-600 text-white">Active</button>
            <button onClick={() => send(codes.inactive)} className="btn-sm bg-gray-500 text-white">Inactive</button>
          </>
        )}
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
      {showRatio && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-theme-text/60">Ratio:</label>
          <input
            type="number" value={ratio} min={1} max={255}
            onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ [storeKey]: { ...prev[storeKey], ratio: +e.target.value } }))}
            className="w-24 input-base"
          />
          <button onClick={() => send(codes.ratio, ratio)}
            disabled={ratio < 1 || ratio > 255}
            className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
        </div>
      )}
    </div>
  );
}
