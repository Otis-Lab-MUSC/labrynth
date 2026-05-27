import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Scissors, RotateCcw } from "lucide-react";
import { useSessionStore } from "../../store/useSessionStore";
import { getClientForSession } from "../../api/sessionClient";
import { EventTimeline } from "./EventTimeline";
import { LiveStats } from "./LiveStats";
import { SessionProgress } from "./SessionProgress";
import { ConfirmDialog } from "../layout/ConfirmDialog";
import { SessionNotes } from "../data/SessionNotes";
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
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
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

  const canControl = session.state === "running" || session.state === "paused";
  const isHostOffline = session.state === "disconnected";

  return (
    <div className="space-y-6">
      <div data-tour="monitor-heading" className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-theme-text">Session</h2>
        <RunningMouseIndicator state={session.state} />
      </div>

      {isHostOffline && (
        <div role="status" className="rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-mono text-red-400">
          Host offline — controls disabled. Session data is preserved.
        </div>
      )}

      {/* Control buttons */}
      <div data-tour="experiment-controls" className="flex flex-wrap items-center gap-4">
        {/* Transport group */}
        <div role="group" aria-label="Session transport controls" className="flex flex-wrap gap-2">
          <button
            onClick={() => setStartModalOpen(true)}
            disabled={session.state === "running"}
            aria-label="Start session"
            title="Start a new session"
            className="inline-flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-white font-mono transition hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Play size={16} aria-hidden="true" />
            Start
          </button>

          <button
            onClick={() => getClientForSession(activeSessionId)?.pauseProgram(activeSessionId)}
            disabled={!canControl}
            aria-label={session.state === "paused" ? "Resume session" : "Pause session"}
            title={session.state === "paused" ? "Resume the paused session" : "Pause the running session"}
            className="inline-flex items-center gap-2 rounded bg-yellow-600 px-4 py-2 text-white font-mono transition hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {session.state === "paused"
              ? <Play size={16} aria-hidden="true" />
              : <Pause size={16} aria-hidden="true" />}
            {session.state === "paused" ? "Resume" : "Pause"}
          </button>

          <button
            onClick={() => setConfirmStop(true)}
            disabled={!canControl}
            aria-label="Stop session"
            title="Stop the session (requires confirmation)"
            className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-white font-mono transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Square size={16} aria-hidden="true" />
            Stop
          </button>
        </div>

        {/* Divider — hidden when row wraps on narrow screens */}
        <div aria-hidden="true" className="hidden sm:block w-px self-stretch bg-theme-border" />

        {/* Tools group */}
        <div role="group" aria-label="Session tools" className="flex flex-wrap gap-2">
          <button
            data-tour="split-button"
            onClick={() => getClientForSession(activeSessionId)?.splitSegment(activeSessionId)}
            disabled={!canControl}
            aria-label="Split segment"
            title="Start a new segment (current segment is marked complete)"
            className="inline-flex items-center gap-2 rounded border border-theme-border bg-transparent px-3 py-2 font-mono text-sm text-theme-text/80 transition hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Scissors size={16} aria-hidden="true" />
            Split
          </button>

          <button
            onClick={() => setConfirmRestart(true)}
            disabled={!canControl}
            aria-label="Restart session"
            title="Restart the session (requires confirmation)"
            className="inline-flex items-center gap-2 rounded border border-theme-border bg-transparent px-3 py-2 font-mono text-sm text-theme-text/80 transition hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Restart
          </button>
        </div>
      </div>

      {/* Export status — compact alert anchored near controls */}
      {session.state === "stopped" && session.exportState.result && (
        <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-mono text-green-400">
          Data saved: {session.exportState.result}
        </div>
      )}
      {session.state === "stopped" && session.exportState.error && !session.exportState.result && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-mono text-red-400">
          Auto-export failed: {session.exportState.error}
        </div>
      )}
      {session.state === "stopped" && session.exportState.exporting && (
        <div className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-mono text-accent">
          Saving session data…
        </div>
      )}

      {/* Segment indicator */}
      {session.segmentNumber > 0 && (
        <div data-tour="segment-indicator" className="text-sm font-mono text-theme-text/60">
          Segment: <span className="text-accent font-bold">{session.segmentNumber + 1}</span>
          <span className="ml-2 text-theme-text/40">({session.segmentNumber} split{session.segmentNumber > 1 ? "s" : ""})</span>
        </div>
      )}

      <SessionProgress session={session} elapsed={elapsed} />
      <div data-tour="live-stats"><LiveStats session={session} elapsed={elapsed} /></div>
      <EventTimeline events={session.behaviorData} />

      <SessionNotes sessionId={activeSessionId} notes={session.notes} />

      <ConfirmDialog
        open={confirmStop}
        title="Stop Session"
        message="Stopping will end the program and disconnect the serial connection. This cannot be undone. If you want a temporary pause, use the Pause button instead."
        confirmLabel="Stop"
        variant="danger"
        secondaryAction={
          session.state === "running"
            ? {
                label: "Pause Instead",
                onClick: () => {
                  getClientForSession(activeSessionId)?.pauseProgram(activeSessionId);
                  setConfirmStop(false);
                },
              }
            : undefined
        }
        onConfirm={() => {
          getClientForSession(activeSessionId)?.stopProgram(activeSessionId);
          setConfirmStop(false);
        }}
        onCancel={() => setConfirmStop(false)}
      />

      <ConfirmDialog
        open={confirmRestart}
        title="Restart Session"
        message="Restarting will reset the program to its initial state and begin again from the start."
        confirmLabel="Restart"
        variant="warning"
        onConfirm={() => {
          getClientForSession(activeSessionId)?.restartProgram(activeSessionId);
          setConfirmRestart(false);
        }}
        onCancel={() => setConfirmRestart(false)}
      />
    </div>
  );
}
