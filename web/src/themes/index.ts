import { reacherTheme } from "./reacher";
import { terminalTheme } from "./terminal";
import { neuralTheme } from "./neural";
import { midnightTheme } from "./midnight";
import { emberTheme } from "./ember";
import type { ThemeDefinition } from "./types";

export type { ThemeDefinition, ColorPalette } from "./types";

// Unused palettes stay in the map but the shell is locked to Reacher / dark.
export const themes: Record<string, ThemeDefinition> = {
  reacher: reacherTheme,
  terminal: terminalTheme,
  neural: neuralTheme,
  midnight: midnightTheme,
  ember: emberTheme,
};

export const themeList = Object.values(themes);
export const defaultThemeId = "reacher";
