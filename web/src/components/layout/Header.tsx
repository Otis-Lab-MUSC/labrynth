import { useState } from "react";
import { Plus, Moon, Sun, RotateCcw } from "lucide-react";
import { useSessionStore } from "../../store/useSessionStore";
import { useThemeStore } from "../../store/useThemeStore";
import { ThemeSelector } from "./ThemeSelector";
import * as api from "../../api/client";

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

export function Header() {
  const { sessions, activeSessionId, setActive, createSession, resetSessionData, setSessionName } = useSessionStore();
  const { mode, toggleMode, theme } = useThemeStore();
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { branding, glass } = theme;

  const handleReset = async () => {
    if (!activeSessionId) return;
    if (!confirm("Reset session? All data will be cleared and the Arduino will restart.")) return;
    try {
      await api.resetSession(activeSessionId);
      resetSessionData(activeSessionId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const handleNewSession = async () => {
    try {
      await createSession("__pending__");
    } catch {
      // Will be handled by session panel
    }
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

  const glassClasses = glass.enabled
    ? "bg-panel/80 backdrop-blur-sm"
    : "bg-panel";

  return (
    <header className={`relative z-10 flex items-center gap-2 border-b border-theme-border ${glassClasses} px-4 py-2`}>
      {/* Branding */}
      <span className="mr-4 text-lg font-bold tracking-wide text-accent title-glow">
        {branding.icon === "neural" && <NeuralIcon />}
        {branding.icon === "bolt" && <BoltIcon />}
        {branding.icon === "ember" && <EmberIcon />}
        {branding.text}
        {branding.showCursor && <span className="animate-blink">|</span>}
      </span>

      {/* Session tabs */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {[...sessions.values()].map((s) => {
          const fallback = `${s.paradigm?.toUpperCase() ?? "New"} (${s.port})`;
          const displayName = s.name || fallback;

          if (editingId === s.id) {
            return (
              <input
                key={s.id}
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
            );
          }

          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              onDoubleClick={() => startEditing(s.id, s.name, fallback)}
              title="Double-click to rename"
              className={`rounded-t px-3 py-1 text-sm transition ${
                s.id === activeSessionId
                  ? "bg-surface font-semibold text-accent"
                  : "hover:bg-accent/10 text-theme-text"
              }`}
            >
              {displayName}
            </button>
          );
        })}
        <button
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

      {/* Mode toggle */}
      <button
        onClick={toggleMode}
        className="rounded p-1.5 hover:bg-accent/10 text-theme-text"
        title="Toggle dark/light"
      >
        {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
