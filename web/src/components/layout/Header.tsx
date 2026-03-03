import { useState } from "react";
import { Plus, Moon, Sun, RotateCcw, X } from "lucide-react";
import { useSessionStore } from "../../store/useSessionStore";
import { useThemeStore } from "../../store/useThemeStore";
import { useLogStore } from "../../store/useLogStore";
import { ThemeSelector } from "./ThemeSelector";
import { ConfirmDialog } from "./ConfirmDialog";
import { HelpButton } from "../tutorial/HelpButton";
import * as api from "../../api/client";
import type { Session, SessionState } from "../../types";

function NeuralIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="inline-block mr-1.5">
      <circle cx="5" cy="10" r="2.5" fill="currentColor" opacity="0.7" />
      <circle cx="15" cy="5" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="15" cy="15" r="2" fill="currentColor" opacity="0.5" />
      <line x1="7" y1="9.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="7" y1="10.5" x2="13" y2="14.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none"
         className="inline-block mr-1.5 animate-bolt-flicker">
      <path d="M11 1L4 12h5l-1 7 7-11h-5l1-7z"
            fill="currentColor" opacity="0.8" />
    </svg>
  );
}

function EmberIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none"
         className="inline-block mr-1.5 animate-ember-sway">
      <path d="M10 2c0 4-4 5-4 9a4 4 0 0 0 8 0c0-4-4-5-4-9z"
            fill="currentColor" opacity="0.7" />
      <path d="M10 8c0 2-1.5 2.5-1.5 4.5a1.5 1.5 0 0 0 3 0c0-2-1.5-2.5-1.5-4.5z"
            fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function ReacherIcon() {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className="inline-block mr-1.5 h-7 w-auto animate-reacher-glow"
      role="img"
      aria-label="Labrynth logo"
    >
      <defs>
        <filter id="brain-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="clip-left-hemi">
          <path d="M 12,50 C 12,38 14,28 18,22 C 22,16 27,12 33,10 C 38,8 43,8 47,10 L 47,92 C 43,92 38,90 33,86 C 27,82 22,74 18,66 C 14,58 12,54 12,50 Z" />
        </clipPath>
        <clipPath id="clip-right-hemi">
          <path d="M 88,50 C 88,38 86,28 82,22 C 78,16 73,12 67,10 C 62,8 57,8 53,10 L 53,92 C 57,92 62,90 67,86 C 73,82 78,74 82,66 C 86,58 88,54 88,50 Z" />
        </clipPath>
      </defs>

      <g filter="url(#brain-glow)">
        {/* ── Layer 1: Left hemisphere outline ── */}
        <path
          d="M 47,10 C 43,8 38,8 33,10 C 28,12 23,16 19,22 C 15,28 13,36 12,44 C 11,52 12,58 15,64 C 18,70 22,76 27,81 C 32,86 37,89 42,91 C 44,92 46,92 47,92"
          stroke="#00d4d8"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ── Layer 1: Right hemisphere outline ── */}
        <path
          d="M 53,10 C 57,8 62,8 67,10 C 72,12 77,16 81,22 C 85,28 87,36 88,44 C 89,52 88,58 85,64 C 82,70 78,76 73,81 C 68,86 63,89 58,91 C 56,92 54,92 53,92"
          stroke="#00d4d8"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ── Layer 1: Center fissure ── */}
        <line x1="50" y1="10" x2="50" y2="92" stroke="#00d4d8" strokeWidth="1.5" strokeLinecap="round" />

        {/* ── Layer 2: Left hemisphere maze corridors ── */}
        <g clipPath="url(#clip-left-hemi)" stroke="#00d4d8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none">
          <polyline points="16,30 16,22 24,22 24,30" />
          <polyline points="20,16 30,16 30,24" />
          <polyline points="36,12 36,20 44,20 44,14" />
          <polyline points="16,36 24,36 24,44 16,44" />
          <polyline points="28,28 28,36 36,36 36,28 44,28" />
          <polyline points="38,36 44,36 44,44 38,44 38,52" />
          <polyline points="16,50 24,50 24,58 16,58" />
          <polyline points="28,44 28,52 20,52" />
          <polyline points="30,56 30,64 38,64 38,56 44,56" />
          <polyline points="16,64 24,64 24,72 16,72" />
          <polyline points="28,68 36,68 36,76 28,76 28,84" />
          <polyline points="36,80 44,80 44,72 44,64" />
        </g>

        {/* ── Layer 2: Right hemisphere maze corridors ── */}
        <g clipPath="url(#clip-right-hemi)" stroke="#00d4d8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none">
          <polyline points="84,30 84,22 76,22 76,30" />
          <polyline points="80,16 70,16 70,24" />
          <polyline points="64,12 64,20 56,20 56,14" />
          <polyline points="84,36 76,36 76,44 84,44" />
          <polyline points="72,28 72,36 64,36 64,28 56,28" />
          <polyline points="62,36 56,36 56,44 62,44 62,52" />
          <polyline points="84,50 76,50 76,58 84,58" />
          <polyline points="72,44 72,52 80,52" />
          <polyline points="70,56 70,64 62,64 62,56 56,56" />
          <polyline points="84,64 76,64 76,72 84,72" />
          <polyline points="72,68 64,68 64,76 72,76 72,84" />
          <polyline points="64,80 56,80 56,72 56,64" />
        </g>
      </g>
    </svg>
  );
}

function SessionStatusDot({ state }: { state: SessionState }) {
  if (state === "idle" || state === "uploading" || state === "connected") {
    return null;
  }

  if (state === "running" || state === "paused") {
    return (
      <span
        className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-green-500 animate-status-pulse"
        aria-label={`Session ${state}`}
      />
    );
  }

  // stopped
  return (
    <span
      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full border border-red-500"
      aria-label="Session stopped"
    />
  );
}

function getCloseWarning(session: Session): { title: string; message: string; variant: "danger" | "warning" } {
  const name = session.name || "Unnamed session";
  if (session.state === "running" || session.state === "paused") {
    return {
      title: "Close running session?",
      message: `"${name}" is currently ${session.state}. Closing will stop the program and discard all unsaved data.`,
      variant: "danger",
    };
  }
  if (session.behaviorData.length > 0) {
    return {
      title: "Close session with data?",
      message: `"${name}" has ${session.behaviorData.length} recorded events that have not been exported. This data will be lost.`,
      variant: "warning",
    };
  }
  return {
    title: "Close session?",
    message: `Close "${name}"?`,
    variant: "warning",
  };
}

export function Header() {
  const {
    sessions,
    activeSessionId,
    sessionOrder,
    setActive,
    createDraft,
    destroySession,
    reorderSession,
    resetSessionData,
    setSessionName,
  } = useSessionStore();
  const { mode, toggleMode, theme } = useThemeStore();
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const { branding, glass } = theme;

  const closingSession = closingId ? sessions.get(closingId) : null;
  const closeWarning = closingSession ? getCloseWarning(closingSession) : null;

  const handleReset = async () => {
    if (!activeSessionId) return;
    if (!confirm("Reset session? All data will be cleared and the Arduino will restart.")) return;
    try {
      await api.resetSession(activeSessionId);
      resetSessionData(activeSessionId);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Reset failed");
      useLogStore.getState().setOpen(true);
    }
  };

  const handleNewSession = () => {
    createDraft();
  };

  const startEditing = (id: string, currentName: string, fallback: string) => {
    setEditingId(id);
    setEditValue(currentName || fallback);
  };

  const commitEdit = () => {
    if (editingId) {
      setSessionName(editingId, editValue.trim());
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleCloseClick = (id: string) => {
    if (editingId === id) cancelEdit();
    const session = sessions.get(id);
    if (session?.draft) {
      destroySession(id);
      return;
    }
    setClosingId(id);
  };

  const handleCloseConfirm = async () => {
    if (!closingId) return;
    const id = closingId;
    setClosingId(null);
    try {
      await destroySession(id);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Failed to close session");
      useLogStore.getState().setOpen(true);
    }
  };

  const glassClasses = glass.enabled
    ? "bg-panel/80 backdrop-blur-sm"
    : "bg-panel";

  return (
    <header data-tour="header" className={`relative z-10 flex items-center gap-2 border-b border-theme-border ${glassClasses} px-4 py-2`}>
      {/* Branding */}
      <span className="mr-4 text-lg font-bold tracking-wide text-accent title-glow">
        {branding.icon === "neural" && <NeuralIcon />}
        {branding.icon === "bolt" && <BoltIcon />}
        {branding.icon === "ember" && <EmberIcon />}
        {branding.icon === "reacher" && <ReacherIcon />}
        {branding.text}
        {branding.showCursor && <span className="animate-blink">|</span>}
      </span>

      {/* Session tabs */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {sessionOrder.map((id) => {
          const s = sessions.get(id);
          if (!s) return null;

          const fallback = s.draft
            ? "New Session"
            : `${s.paradigm?.toUpperCase() ?? "New"} (${s.port})`;
          const displayName = s.name || fallback;

          if (editingId === s.id) {
            return (
              <div key={s.id} className="group relative flex items-center">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="rounded-t px-3 py-1 text-sm bg-surface text-accent border border-theme-border outline-none w-40"
                />
              </div>
            );
          }

          return (
            <div
              key={s.id}
              draggable={editingId !== s.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.id);
                setDragId(s.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragId && s.id !== dragId) setDropTargetId(s.id);
              }}
              onDragLeave={() => setDropTargetId((prev) => (prev === s.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData("text/plain");
                if (fromId && fromId !== s.id) reorderSession(fromId, s.id);
                setDragId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
              className={`group relative flex items-center ${
                dragId === s.id ? "opacity-40" : ""
              } ${
                dropTargetId === s.id ? "border-l-2 border-accent" : ""
              }`}
            >
              <button
                onClick={() => setActive(s.id)}
                onDoubleClick={() => startEditing(s.id, s.name, fallback)}
                title="Double-click to rename"
                className={`flex items-center rounded-t px-3 py-1 text-sm transition ${
                  s.id === activeSessionId
                    ? "bg-surface font-semibold text-accent"
                    : "hover:bg-accent/10 text-theme-text"
                }`}
              >
                <SessionStatusDot state={s.state} />
                {displayName}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseClick(s.id); }}
                className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-theme-text/40 hover:text-red-400 transition"
                title="Close session"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button
          data-tour="new-session"
          onClick={handleNewSession}
          className="ml-1 rounded p-1 hover:bg-accent/10 text-theme-text"
          title="New session"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1" />

      {/* Reset button */}
      {activeSession && (activeSession.state === "connected" || activeSession.state === "stopped") && (
        <button
          onClick={handleReset}
          className="rounded p-1.5 hover:bg-red-500/20 text-theme-text"
          title="Reset session"
        >
          <RotateCcw size={18} />
        </button>
      )}

      {/* Theme selector */}
      <ThemeSelector />

      {/* Help button */}
      <HelpButton />

      {/* Mode toggle */}
      <button
        onClick={toggleMode}
        className="rounded p-1.5 hover:bg-accent/10 text-theme-text"
        title="Toggle dark/light"
      >
        {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Close confirmation dialog */}
      <ConfirmDialog
        open={!!closingId && !!closeWarning}
        title={closeWarning?.title ?? ""}
        message={closeWarning?.message ?? ""}
        confirmLabel="Close"
        variant={closeWarning?.variant ?? "warning"}
        onConfirm={handleCloseConfirm}
        onCancel={() => setClosingId(null)}
      />
    </header>
  );
}
