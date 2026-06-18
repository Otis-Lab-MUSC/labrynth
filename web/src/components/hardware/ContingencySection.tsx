import { useEffect } from "react";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";

interface Props {
  sessionId: string;
  deviceKey: "primaryCue" | "secondaryCue" | "primaryPump" | "secondaryPump";
  paradigm?: string;
}

// Per-device lever routing filter commands (0=any, 1=RH_only, 2=LH_only)
const FILTER_CMD: Record<Props["deviceKey"], number> = {
  primaryCue:    378,
  secondaryCue:  388,
  primaryPump:   478,
  secondaryPump: 488,
};

// Per-device onset delay commands (ms from trigger to device activation)
const DELAY_CMD: Record<Props["deviceKey"], number> = {
  primaryCue:    377,
  secondaryCue:  387,
  primaryPump:   477,
  secondaryPump: 487,
};

export function ContingencySection({ sessionId, deviceKey, paradigm }: Props) {
  const device    = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[deviceKey]);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  // Press-contingency is invalid for omission (rewards the *absence* of a press) and
  // pavlovian (stimulus-driven, not operant), so the lever-routing controls are hidden.
  const showLevers = paradigm !== "pavlovian" && paradigm !== "omission";

  // Clear any previously-set lever routing when switching into a non-press-contingent
  // paradigm, so no stale RH/LH filter stays active on the device firmware (#66).
  useEffect(() => {
    const current = device?.contingency.leverFilter;
    if (showLevers || !current || current === "none") return;
    getClientForSession(sessionId)?.sendCommand(sessionId, FILTER_CMD[deviceKey], 0);
    updateHardwareUi(sessionId, (prev) => ({
      [deviceKey]: {
        ...(prev[deviceKey] as NonNullable<typeof device>),
        contingency: {
          ...(prev[deviceKey] as NonNullable<typeof device>).contingency,
          leverFilter: "none" as const,
        },
      },
    }));
  }, [showLevers, device, sessionId, deviceKey, updateHardwareUi]);

  if (!device) return null;

  const contingency = device.contingency;
  const leverFilter = contingency.leverFilter;

  const send = (code: number, value?: number) =>
    getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  const setFilter = (value: "none" | "rh" | "lh") => {
    const numVal = value === "rh" ? 1 : value === "lh" ? 2 : 0;
    send(FILTER_CMD[deviceKey], numVal);
    updateHardwareUi(sessionId, (prev) => ({
      [deviceKey]: {
        ...(prev[deviceKey] as typeof device),
        contingency: {
          ...(prev[deviceKey] as typeof device).contingency,
          leverFilter: value,
        },
      },
    }));
  };

  const setDelay = (ms: number) => {
    send(DELAY_CMD[deviceKey], ms);
    updateHardwareUi(sessionId, (prev) => ({
      [deviceKey]: {
        ...(prev[deviceKey] as typeof device),
        contingency: {
          ...(prev[deviceKey] as typeof device).contingency,
          delay: ms,
        },
      },
    }));
  };

  return (
    <div className="border-t border-theme-text/10 pt-2 mt-1 space-y-2">
      {showLevers && (
        <>
          <div className="text-xs font-medium uppercase tracking-wide text-theme-text/60">Contingent on</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-theme-text/60">Trigger on:</span>
          {(["none", "rh", "lh"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                leverFilter === opt
                  ? "bg-accent text-white"
                  : "bg-theme-text/10 text-theme-text/70 hover:bg-theme-text/20"
              }`}
            >
              {opt === "none" ? "Any" : opt.toUpperCase()}
            </button>
          ))}
          </div>
        </>
      )}
      <div className="flex items-center gap-2">
        <label className="text-xs text-theme-text/60">Delay (ms):</label>
        <input
          type="number"
          min={0}
          max={600000}
          value={contingency.delay}
          onChange={(e) => setDelay(+e.target.value)}
          className="w-24 input-base"
          title="Onset delay from trigger to device activation"
        />
      </div>
    </div>
  );
}
