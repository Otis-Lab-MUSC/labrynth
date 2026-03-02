import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import * as api from "../../api/client";
import { EventTimeline } from "./EventTimeline";
import { LiveStats } from "./LiveStats";

export function MonitorPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const setStartModalOpen = useSessionStore((s) => s.setStartModalOpen);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (session?.state === "running") {
      timerRef.current = setInterval(() => forceUpdate((n) => n + 1), 1000);
      return () => clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
    }
  }, [session?.state]);

  const elapsed =
    session?.programStartTime &&
    (session.state === "running" || session.state === "paused" || session.state === "stopped")
      ? ((session.state === "stopped" && session.programEndTime
          ? session.programEndTime
          : Date.now())
        - session.programStartTime
        - (session.pausedTime ?? 0)
        - (session.state === "paused" && session.pauseStartTime
          ? Date.now() - session.pauseStartTime
          : 0)) / 1000
      : 0;

  if (!activeSessionId || !session || session.draft) {
    return <p className="text-theme-text/60 font-mono">No active session.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Monitor</h2>

      {/* Control buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setStartModalOpen(true)}
          disabled={session.state === "running"}
          className="rounded bg-green-600 px-4 py-2 text-white font-mono hover:bg-green-700 disabled:opacity-50"
        >
          Start
        </button>
        <button
          onClick={() => api.stopProgram(activeSessionId)}
          disabled={session.state !== "running" && session.state !== "paused"}
          className="rounded bg-red-600 px-4 py-2 text-white font-mono hover:bg-red-700 disabled:opacity-50"
        >
          Stop
        </button>
        <button
          onClick={() => api.pauseProgram(activeSessionId)}
          disabled={session.state !== "running" && session.state !== "paused"}
          className="rounded bg-yellow-600 px-4 py-2 text-white font-mono hover:bg-yellow-700 disabled:opacity-50"
        >
          {session.state === "paused" ? "Resume" : "Pause"}
        </button>
      </div>

      <LiveStats session={session} elapsed={elapsed} />
      <EventTimeline events={session.behaviorData} />
    </div>
  );
}
