import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import type { HardwareUiState } from "../../types";

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

const LEVER_ACTIVE_CMD = {
  rh: { active: 1081, inactive: 1080 },
  lh: { active: 1381, inactive: 1380 },
};

export function ContingencySection({ sessionId, deviceKey, paradigm }: Props) {
  const device    = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[deviceKey]);
  const hardwareUi = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!device || !hardwareUi) return null;

  const contingency = device.contingency;
  const leverFilter = contingency.leverFilter;

  const send = (code: number, value?: number) =>
    getClientForSession(sessionId)?.sendCommand(sessionId, code, value);

  // Check if any armed output device has a conflicting non-"none" lever filter
  const armedOutputKeys: (keyof HardwareUiState)[] = ["primaryCue", "secondaryCue", "primaryPump", "secondaryPump"];
  const armedFilters = armedOutputKeys
    .map((k) => (hardwareUi[k] as { armed?: boolean; contingency?: { leverFilter?: string } } | undefined))
    .filter((d) => d?.armed && d?.contingency?.leverFilter && d.contingency.leverFilter !== "none")
    .map((d) => d!.contingency!.leverFilter);
  const uniqueFilters = new Set(armedFilters);
  const hasConflict = uniqueFilters.size > 1;

  const setFilter = (value: "none" | "rh" | "lh") => {
    const numVal = value === "rh" ? 1 : value === "lh" ? 2 : 0;

    // 1. Send per-device filter command to firmware
    send(FILTER_CMD[deviceKey], numVal);

    // 2. Send LEVER_SET_ACTIVE for ratio counting
    if (value !== "none") {
      const other = value === "rh" ? "lh" : "rh";
      send(LEVER_ACTIVE_CMD[value].active);
      send(LEVER_ACTIVE_CMD[other].inactive);
    }

    // 3. Update only this device's UI state (no global mirroring)
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

  const showLevers = paradigm !== "pavlovian";

  return (
    <div className="border-t border-theme-text/10 pt-2 mt-1 space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-theme-text/60">Contingent on</div>
      {showLevers && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-theme-text/60">Trigger on:</span>
          {(["none", "rh", "lh"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                leverFilter === opt
                  ? "bg-theme-accent text-white"
                  : "bg-theme-text/10 text-theme-text/70 hover:bg-theme-text/20"
              }`}
            >
              {opt === "none" ? "Any" : opt.toUpperCase()}
            </button>
          ))}
          {hasConflict && (
            <span className="text-amber-500 text-xs ml-1">⚠ Conflict</span>
          )}
        </div>
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
          title="Onset delay — UI-only; firmware support not yet available"
        />
      </div>
    </div>
  );
}
