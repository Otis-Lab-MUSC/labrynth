import { create } from "zustand";
import { themes, defaultThemeId } from "../themes";
import type { ThemeDefinition, ColorPalette } from "../themes";

type Mode = "dark" | "light";

interface ThemeStore {
  themeId: string;
  mode: Mode;
  theme: ThemeDefinition;
  toggleMode: () => void;
}

const FONT_MAP: Record<string, string> = {
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  sans: "Inter, system-ui, sans-serif",
  cyberpunk: "'Rajdhani', sans-serif",
};

const MONO_MAP: Record<string, string> = {
  cyberpunk: "'Share Tech Mono', monospace",
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  sans: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
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
  root.style.setProperty("--font-mono", MONO_MAP[theme.font] ?? MONO_MAP.mono);
  root.style.setProperty("--radius-sm", theme.radius.sm);
  root.style.setProperty("--radius-md", theme.radius.md);
  root.style.setProperty("--radius-lg", theme.radius.lg);
  root.style.setProperty("--glass-opacity", String(theme.glass.opacity));
  root.style.setProperty("--glass-blur", theme.glass.blur);

  // Text dim token
  if (palette.textDim) {
    root.style.setProperty("--color-text-dim", palette.textDim);
  } else {
    root.style.removeProperty("--color-text-dim");
  }

  // Theme-specific class toggle
  root.classList.toggle("theme-reacher", theme.id === "reacher");

  // Persist
  localStorage.setItem("labrynth-mode", mode);
}

export const useThemeStore = create<ThemeStore>((set) => {
  const initialMode = getInitialMode();
  const initialTheme = themes[defaultThemeId];

  // Apply synchronously before first render
  apply(initialTheme, initialMode);

  return {
    themeId: defaultThemeId,
    mode: initialMode,
    theme: initialTheme,

    toggleMode: () =>
      set((s) => {
        const next: Mode = s.mode === "dark" ? "light" : "dark";
        apply(s.theme, next);
        return { mode: next };
      }),
  };
});
