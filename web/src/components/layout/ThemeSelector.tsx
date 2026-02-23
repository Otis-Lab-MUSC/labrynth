import { useState, useRef, useEffect } from "react";
import { Palette } from "lucide-react";
import { useThemeStore } from "../../store/useThemeStore";
import { themeList } from "../../themes";

export function ThemeSelector() {
  const { themeId, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-1.5 hover:bg-accent/10 text-theme-text"
        title="Change theme"
      >
        <Palette size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-theme-border bg-panel p-1 shadow-lg">
          {themeList.map((t) => {
            const isActive = t.id === themeId;
            const [r, g, b] = t.colors.dark.accent.split(" ").map(Number);
            return (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-theme-text hover:bg-accent/5"
                }`}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                />
                {t.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
