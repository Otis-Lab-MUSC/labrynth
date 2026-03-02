import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import * as api from "../../api/client";
import { EventTimeline } from "./EventTimeline";
import { LiveStats } from "./LiveStats";
import type { SessionState } from "../../types";

function RunningMouseIndicator({ state }: { state: SessionState }) {
  const isRunning = state === "running";
  const isPaused = state === "paused";

  if (!isRunning && !isPaused) {
    return <span className="text-sm text-theme-text/40 font-mono">Waiting...</span>;
  }

  const legClass = isRunning ? "origin-top animate-mouse-run" : "";

  return (
    <div
      className={`flex items-center gap-2 ${isPaused ? "opacity-50" : ""}`}
      role="status"
      aria-label={isRunning ? "Experiment running" : "Experiment paused"}
    >
      <svg viewBox="0 0 64 32" width="48" height="24" fill="none" className="text-current">
        {/* Body */}
        <ellipse cx="28" cy="18" rx="14" ry="9" fill="currentColor" opacity="0.8" />
        {/* Head */}
        <ellipse cx="46" cy="14" rx="8" ry="7" fill="currentColor" opacity="0.8" />
        {/* Ears */}
        <ellipse cx="50" cy="7" rx="3" ry="4" fill="currentColor" opacity="0.6" />
        <ellipse cx="44" cy="6" rx="3" ry="4" fill="currentColor" opacity="0.6" />
        {/* Eye */}
        <circle cx="51" cy="12" r="1.2" fill="currentColor" opacity="0.3" />
        {/* Tail */}
        <path d="M14 18 Q6 10 2 14 Q0 16 4 18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" />
        {/* Front-left leg */}
        <line x1="38" y1="24" x2="38" y2="31" stroke="currentColor" strokeWidth="1.8" className={legClass} />
        {/* Front-right leg (offset delay) */}
        <line x1="34" y1="24" x2="34" y2="31" stroke="currentColor" strokeWidth="1.8" className={legClass} style={isRunning ? { animationDelay: "0.15s" } : undefined} />
        {/* Back-left leg (offset delay) */}
        <line x1="22" y1="24" x2="22" y2="31" stroke="currentColor" strokeWidth="1.8" className={legClass} style={isRunning ? { animationDelay: "0.15s" } : undefined} />
        {/* Back-right leg */}
        <line x1="18" y1="24" x2="18" y2="31" stroke="currentColor" strokeWidth="1.8" className={legClass} />
      </svg>
      <span className={`text-sm font-mono ${isRunning ? "text-accent" : "text-theme-text/40"}`}>
        {isRunning ? "Running" : "Paused"}
      </span>
    </div>
  );
}

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-theme-text">Monitor</h2>
        <RunningMouseIndicator state={session.state} />
      </div>

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
