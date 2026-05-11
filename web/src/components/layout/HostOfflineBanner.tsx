import { useState, useEffect } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { useMachineStore } from "../../store/useMachineStore";

export function HostOfflineBanner() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const machines = useMachineStore((s) => s.machines);
  const [dismissed, setDismissed] = useState(false);

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;
  const machine = activeSession?.machineId ? machines.find((m) => m.deviceId === activeSession.machineId) : null;
  const show = !dismissed && !!machine && !machine.isLocal && !machine.online && activeSession?.state !== "idle";

  // Reset dismissed when the machine comes back online
  useEffect(() => {
    if (machine?.online) setDismissed(false);
  }, [machine?.online]);

  if (!show) return null;

  return (
    <div className="relative z-20 flex items-center justify-center gap-3 bg-red-500/10 px-4 py-2 text-sm text-red-400 border-b border-red-500/20">
      <span>
        Remote host <strong>{machine!.hostname}</strong> is offline — session data has been preserved
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss host offline notification"
      >
        &times;
      </button>
    </div>
  );
}
