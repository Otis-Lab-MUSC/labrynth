import { useEffect, useRef, useCallback } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useLogStore } from "../../store/useLogStore";
import type { LogLevel } from "../../store/useLogStore";

const LEVEL_CLASSES: Record<LogLevel, string> = {
  info: "text-accent",
  warn: "text-yellow-500",
  error: "text-red-500",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export function TerminalPanel() {
  const entries = useLogStore((s) => s.entries);
  const isOpen = useLogStore((s) => s.isOpen);
  const toggleOpen = useLogStore((s) => s.toggleOpen);
  const clearLogs = useLogStore((s) => s.clearLogs);

  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // In flex-col-reverse, scrollTop 0 = bottom. Negative = scrolled up.
    userScrolledUp.current = el.scrollTop < -8;
  }, []);

  // Auto-scroll to bottom when new entries arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  return (
    <div data-tour="terminal-bar" className="border-t border-theme-border bg-surface flex-shrink-0">
      {/* Toggle bar */}
      <button
        onClick={toggleOpen}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-theme-text/70 hover:text-theme-text hover:bg-accent/5 transition"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-mono text-xs font-medium tracking-wide">Terminal</span>
        {entries.length > 0 && (
          <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0 text-[10px] font-mono text-accent">
            {entries.length}
          </span>
        )}
        <span className="flex-1" />
        {isOpen && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              clearLogs();
            }}
            className="rounded p-0.5 hover:bg-red-500/20 text-theme-text/40 hover:text-red-400 transition"
            title="Clear logs"
          >
            <Trash2 size={13} />
          </span>
        )}
      </button>

      {/* Log area */}
      {isOpen && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex h-60 flex-col-reverse overflow-y-auto px-3 pb-2 font-mono text-xs leading-relaxed"
        >
          {entries.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-px">
              <span className="text-theme-text/30 whitespace-nowrap">
                [{formatTime(entry.timestamp)}]
              </span>
              <span className={`w-11 shrink-0 font-semibold uppercase ${LEVEL_CLASSES[entry.level]}`}>
                {entry.level}
              </span>
              <span className="text-theme-text/50">&mdash;</span>
              <span className={`break-all ${entry.level === "error" ? "text-red-400" : "text-theme-text/80"}`}>
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
