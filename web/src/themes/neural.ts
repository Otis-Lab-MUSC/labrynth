/* PRESERVED — theme switching disabled.
   This theme is intentionally retained for potential future use.
   To re-enable, restore the ThemeSwitcher component and theme state logic. */
import type { ThemeDefinition } from "./types";

export const neuralTheme: ThemeDefinition = {
  id: "neural",
  name: "Neural",
  colors: {
    light: {
      surface: "255 255 255",
      panel: "248 250 252",
      textPrimary: "30 41 59",
      textSecondary: "100 116 139",
      accent: "124 58 237",
      accentHover: "109 40 217",
      accentContrast: "255 255 255",
      border: "100 116 139",
      input: "241 245 249",
    },
    dark: {
      surface: "10 11 20",
      panel: "17 24 39",
      textPrimary: "226 232 240",
      textSecondary: "148 163 184",
      accent: "139 92 246",
      accentHover: "167 139 250",
      accentContrast: "255 255 255",
      border: "139 92 246",
      input: "15 23 42",
    },
  },
  font: "sans",
  radius: { sm: "0.5rem", md: "0.5rem", lg: "0.75rem" },
  glass: { enabled: true, opacity: 0.8, blur: "8px" },
  branding: {
    type: "clean",
    text: "Labrynth",
    showCursor: false,
    icon: "neural",
  },
  sidebar: { activeStyle: "left-accent", itemPrefix: "" },
  background: "neural",
};
