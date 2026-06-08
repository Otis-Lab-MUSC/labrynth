import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";

interface Props {
  sessionId: string;
  deviceKey: "primaryCue" | "secondaryCue" | "primaryPump" | "secondaryPump";
  paradigm?: string;
}

const LEVER_CMD = {
  rh: { active: 1081, inactive: 1080 },
  lh: { active: 1381, inactive: 1380 },
};

export function ContingencySection({ sessionId, deviceKey, paradigm }: Props) {
  const device = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi[deviceKey]);
  const activeLever = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.activeLever ?? null);
  const lickArmed = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.lickCircuit.armed ?? false);
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!device) return null;

  const showLevers = paradigm !== "pavlovian";
  const contingency = device.contingency;
  const send = (code: number) => getClientForSession(sessionId)?.sendCommand(sessionId, code);

  const rhChecked = activeLever === "rh";
  const lhChecked = activeLever === "lh";

  const toggleLever = (side: "rh" | "lh", next: boolean) => {
    const sideKey = side === "rh" ? "rhLever" : "lhLever";
    if (next) {
      send(LEVER_CMD[side].active);
      updateHardwareUi(sessionId, (prev) => ({
        activeLever: side,
        primaryCue:    { ...prev.primaryCue,    contingency: { ...prev.primaryCue.contingency,    rhLever: side === "rh", lhLever: side === "lh" } },
        secondaryCue:  { ...prev.secondaryCue,  contingency: { ...prev.secondaryCue.contingency,  rhLever: side === "rh", lhLever: side === "lh" } },
        primaryPump:   { ...prev.primaryPump,   contingency: { ...prev.primaryPump.contingency,   rhLever: side === "rh", lhLever: side === "lh" } },
        secondaryPump: { ...prev.secondaryPump, contingency: { ...prev.secondaryPump.contingency, rhLever: side === "rh", lhLever: side === "lh" } },
      }));
    } else {
      send(LEVER_CMD[side].inactive);
      updateHardwareUi(sessionId, (prev) => ({
        activeLever: null,
        primaryCue:    { ...prev.primaryCue,    contingency: { ...prev.primaryCue.contingency,    [sideKey]: false } },
        secondaryCue:  { ...prev.secondaryCue,  contingency: { ...prev.secondaryCue.contingency,  [sideKey]: false } },
        primaryPump:   { ...prev.primaryPump,   contingency: { ...prev.primaryPump.contingency,   [sideKey]: false } },
        secondaryPump: { ...prev.secondaryPump, contingency: { ...prev.secondaryPump.contingency, [sideKey]: false } },
      }));
    }
  };

  const toggleLick = (next: boolean) => {
    send(next ? 501 : 500);
    updateHardwareUi(sessionId, (prev) => ({
      lickCircuit: { armed: next },
      primaryCue:    { ...prev.primaryCue,    contingency: { ...prev.primaryCue.contingency,    lickCircuit: next } },
      secondaryCue:  { ...prev.secondaryCue,  contingency: { ...prev.secondaryCue.contingency,  lickCircuit: next } },
      primaryPump:   { ...prev.primaryPump,   contingency: { ...prev.primaryPump.contingency,   lickCircuit: next } },
      secondaryPump: { ...prev.secondaryPump, contingency: { ...prev.secondaryPump.contingency, lickCircuit: next } },
    }));
  };

  const setDelay = (ms: number) => {
    updateHardwareUi(sessionId, (prev) => ({
      [deviceKey]: { ...prev[deviceKey], contingency: { ...prev[deviceKey].contingency, delay: ms } },
    }));
  };

  return (
    <div className="border-t border-theme-text/10 pt-2 mt-1 space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-theme-text/60">Contingent on</div>
      <div className="flex flex-wrap gap-3 items-center">
        {showLevers && (
          <>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={rhChecked}
                onChange={(e) => toggleLever("rh", e.target.checked)}
                className="cursor-pointer"
              />
              RH Lever
            </label>
            <label className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={lhChecked}
                onChange={(e) => toggleLever("lh", e.target.checked)}
                className="cursor-pointer"
              />
              LH Lever
            </label>
          </>
        )}
        <label className="flex items-center gap-1 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={lickArmed && contingency.lickCircuit}
            onChange={(e) => toggleLick(e.target.checked)}
            className="cursor-pointer"
          />
          Lick Circuit
        </label>
      </div>
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
