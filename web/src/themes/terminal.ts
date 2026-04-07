/* PRESERVED — theme switching disabled.
   This theme is intentionally retained for potential future use.
   To re-enable, restore the ThemeSwitcher component and theme state logic. */
import type { ThemeDefinition } from "./types";

export const terminalTheme: ThemeDefinition = {
  id: "terminal",
  name: "Terminal",
  colors: {
    light: {
      surface: "255 255 255",
      panel: "243 244 246",
      textPrimary: "17 24 39",
      textSecondary: "107 114 128",
      accent: "22 163 74",
      accentHover: "21 128 61",
      accentContrast: "0 0 0",
      border: "0 0 0",
      input: "249 250 251",
    },
    dark: {
      surface: "10 10 10",
      panel: "17 17 17",
      textPrimary: "176 255 176",
      textSecondary: "176 255 176",
      accent: "0 255 65",
      accentHover: "0 204 52",
      accentContrast: "0 0 0",
      border: "0 255 65",
      input: "0 0 0",
    },
  },
  font: "mono",
  radius: { sm: "0.25rem", md: "0.25rem", lg: "0.5rem" },
  glass: { enabled: false, opacity: 1, blur: "0px" },
  branding: {
    type: "terminal",
    text: "$ user@labrynth_",
    showCursor: true,
    icon: null,
  },
  sidebar: { activeStyle: "filled", itemPrefix: "> " },
  background: "ct-scan",
};
