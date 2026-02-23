import { create } from "zustand";
import { themes, defaultThemeId } from "../themes";
import type { ThemeDefinition, ColorPalette } from "../themes";

type Mode = "dark" | "light";

interface ThemeStore {
  themeId: string;
  mode: Mode;
  theme: ThemeDefinition;
  toggleMode: () => void;
  setTheme: (id: string) => void;
}

const FONT_MAP: Record<string, string> = {
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  sans: "Inter, system-ui, sans-serif",
};

function migrateKey(oldKey: string, newKey: string): void {
  const legacy = localStorage.getItem(oldKey);
  if (legacy !== null) {
    localStorage.setItem(newKey, legacy);
    localStorage.removeItem(oldKey);
  }
}

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "dark";
  migrateKey("reacher-mode", "labrynth-mode");
  const stored = localStorage.getItem("labrynth-mode");
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function getInitialThemeId(): string {
  if (typeof window === "undefined") return defaultThemeId;
  migrateKey("reacher-theme-id", "labrynth-theme-id");
  const stored = localStorage.getItem("labrynth-theme-id");
  if (stored && themes[stored]) return stored;
  return defaultThemeId;
}

function apply(theme: ThemeDefinition, mode: Mode) {
  const root = document.documentElement;
  const palette: ColorPalette = theme.colors[mode];

  // Dark class toggle
  root.classList.toggle("dark", mode === "dark");

  // Color variables
  root.style.setProperty("--color-surface", palette.surface);
  root.style.setProperty("--color-panel", palette.panel);
  root.style.setProperty("--color-text-primary", palette.textPrimary);
  root.style.setProperty("--color-text-secondary", palette.textSecondary);
  root.style.setProperty("--color-accent", palette.accent);
  root.style.setProperty("--color-accent-hover", palette.accentHover);
  root.style.setProperty("--color-accent-contrast", palette.accentContrast);
  root.style.setProperty("--color-border", palette.border);
  root.style.setProperty("--color-input", palette.input);

  // Style variables
  root.style.setProperty("--font-body", FONT_MAP[theme.font] ?? FONT_MAP.mono);
  root.style.setProperty("--radius-sm", theme.radius.sm);
  root.style.setProperty("--radius-md", theme.radius.md);
  root.style.setProperty("--radius-lg", theme.radius.lg);
  root.style.setProperty("--glass-opacity", String(theme.glass.opacity));
  root.style.setProperty("--glass-blur", theme.glass.blur);

  // Persist
  localStorage.setItem("labrynth-mode", mode);
  localStorage.setItem("labrynth-theme-id", theme.id);
}

export const useThemeStore = create<ThemeStore>((set) => {
  const initialMode = getInitialMode();
  const initialThemeId = getInitialThemeId();
  const initialTheme = themes[initialThemeId];

  // Apply synchronously before first render
  apply(initialTheme, initialMode);

  return {
    themeId: initialThemeId,
    mode: initialMode,
    theme: initialTheme,

    toggleMode: () =>
      set((s) => {
        const next: Mode = s.mode === "dark" ? "light" : "dark";
        apply(s.theme, next);
        return { mode: next };
      }),

    setTheme: (id: string) =>
      set((s) => {
        const next = themes[id];
        if (!next) return s;
        apply(next, s.mode);
        return { themeId: id, theme: next };
      }),
  };
});
