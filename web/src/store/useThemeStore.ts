import { create } from "zustand";
import { themes, defaultThemeId } from "../themes";
import type { ThemeDefinition, ColorPalette } from "../themes";

interface ThemeStore {
  themeId: string;
  theme: ThemeDefinition;
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

/** Dark is the only mode. Clear the keys older builds used to persist a light/dark choice. */
function clearLegacyModeKeys(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("reacher-mode");
  localStorage.removeItem("labrynth-mode");
}

function apply(theme: ThemeDefinition) {
  const root = document.documentElement;
  const palette: ColorPalette = theme.colors.dark;

  root.classList.add("dark");

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
}

export const useThemeStore = create<ThemeStore>(() => {
  const initialTheme = themes[defaultThemeId];

  clearLegacyModeKeys();
  // Apply synchronously before first render
  apply(initialTheme);

  return {
    themeId: defaultThemeId,
    theme: initialTheme,
  };
});
