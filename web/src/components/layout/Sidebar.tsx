import { Cable, SlidersHorizontal, Activity, Database } from "lucide-react";
import { useThemeStore } from "../../store/useThemeStore";
import { useSessionStore } from "../../store/useSessionStore";

const items = [
  { key: "session", label: "Session", icon: Cable },
  { key: "configuration", label: "Configuration", icon: SlidersHorizontal },
  { key: "monitor", label: "Monitor", icon: Activity },
  { key: "data", label: "Data", icon: Database },
] as const;

interface Props {
  active: string;
  onSelect: (key: string) => void;
}

export function Sidebar({ active, onSelect }: Props) {
  const { sidebar, glass } = useThemeStore((s) => s.theme);
  const sessionState = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId)?.state : undefined
  );
  const sessionRunning = sessionState === "running";

  const glassClasses = glass.enabled
    ? "bg-panel/80 backdrop-blur-sm"
    : "bg-panel";

  return (
    <nav data-tour="sidebar" className={`flex w-48 flex-col gap-1 border-r border-theme-border ${glassClasses} p-2`}>
      {items.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;

        const activeClasses =
          sidebar.activeStyle === "filled"
            ? "bg-accent/15 text-accent border border-accent/30 shadow-glow-sm"
            : "border-l-[3px] border-l-accent bg-accent/10 text-accent border-y border-r border-y-transparent border-r-transparent";

        const inactiveClasses =
          sidebar.activeStyle === "filled"
            ? "hover:bg-accent/10 text-theme-text border border-transparent"
            : "hover:bg-accent/5 text-theme-text border-l-[3px] border-transparent";

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              isActive ? activeClasses : inactiveClasses
            }`}
          >
            <Icon
              size={18}
              className={key === "monitor" && sessionRunning ? "motion-safe:animate-status-pulse" : undefined}
            />
            <span>{sidebar.itemPrefix}{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
