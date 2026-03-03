import { useEffect, useState } from "react";
import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import { LeverControl } from "./LeverControl";
import { CueControl } from "./CueControl";
import { PumpControl } from "./PumpControl";
import { LaserControl } from "./LaserControl";
import { LickCircuitControl } from "./LickCircuitControl";
import { MicroscopeControl } from "./MicroscopeControl";
import type { CommandSpec } from "../../types";

export function HardwarePanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const testMode = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId)?.hardwareUi.testMode ?? false : false
  );
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const [commands, setCommands] = useState<CommandSpec[]>([]);

  useEffect(() => {
    if (!activeSessionId) return;
    api.getCommands(activeSessionId).then((r) => {
      setCommands(r.commands as unknown as CommandSpec[]);
    }).catch(() => {});
  }, [activeSessionId, session?.paradigm]);

  if (!activeSessionId || !session || session.draft) {
    return <p className="text-theme-text/60 font-mono">No active session. Create one in the Session panel.</p>;
  }

  const paradigm = session.paradigm?.toLowerCase();
  const hasLaser = paradigm !== "pavlovian";
  const showSystemControls = paradigm !== "pavlovian";

  const handleTestChain = () => api.sendCommand(activeSessionId, 103);
  const handleTestMode = () => {
    const next = !testMode;
    updateHardwareUi(activeSessionId, () => ({ testMode: next }));
    api.sendCommand(activeSessionId, 104, next ? 1 : 0);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Hardware Controls</h2>
      <p className="text-sm text-theme-text/60 font-mono">
        Paradigm: <span className="font-medium text-accent">{session.paradigm?.toUpperCase() ?? "Unknown"}</span>
        {" — "}{commands.length} commands available
      </p>

      {/* System Controls — Issue #2A */}
      {showSystemControls && (
        <div data-tour="system-controls" className="card">
          <h3 className="font-medium text-theme-text">System Controls</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleTestChain}
              className="btn-sm bg-yellow-600 text-white"
            >
              Test Chain
            </button>
            <button
              onClick={handleTestMode}
              className={`btn-sm ${testMode ? "btn-toggle-accent-on" : "btn-toggle-accent-off"}`}
            >
              Test Mode: {testMode ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div data-tour="lever-card"><LeverControl sessionId={activeSessionId} side="RH" paradigm={paradigm} /></div>
        <LeverControl sessionId={activeSessionId} side="LH" paradigm={paradigm} />
        <div data-tour="cue-card"><CueControl sessionId={activeSessionId} label="Primary" prefix="" /></div>
        <CueControl sessionId={activeSessionId} label="Secondary" prefix="2" />
        <div data-tour="pump-card"><PumpControl sessionId={activeSessionId} label="Primary" prefix="" /></div>
        <PumpControl sessionId={activeSessionId} label="Secondary" prefix="2" />
        <LickCircuitControl sessionId={activeSessionId} />
        <MicroscopeControl sessionId={activeSessionId} />
        {hasLaser && <LaserControl sessionId={activeSessionId} />}
      </div>
    </div>
  );
}
