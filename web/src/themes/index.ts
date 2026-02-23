import { terminalTheme } from "./terminal";
import { neuralTheme } from "./neural";
import { midnightTheme } from "./midnight";
import { emberTheme } from "./ember";
import type { ThemeDefinition } from "./types";

export type { ThemeDefinition, ColorPalette } from "./types";

export const themes: Record<string, ThemeDefinition> = {
  terminal: terminalTheme,
  neural: neuralTheme,
  midnight: midnightTheme,
  ember: emberTheme,
};

export const themeList = Object.values(themes);
export const defaultThemeId = "terminal";
