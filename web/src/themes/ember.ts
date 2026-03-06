/* PRESERVED — theme switching disabled.
   This theme is intentionally retained for potential future use.
   To re-enable, restore the ThemeSwitcher component and theme state logic. */
import type { ThemeDefinition } from "./types";

export const emberTheme: ThemeDefinition = {
  id: "ember",
  name: "Ember",
  colors: {
    light: {
      surface: "255 251 245",       // warm white
      panel: "254 243 230",         // warm cream
      textPrimary: "41 25 15",      // dark warm brown
      textSecondary: "120 90 65",   // warm mid-brown
      accent: "217 119 6",          // amber-600
      accentHover: "180 83 9",      // amber-700
      accentContrast: "0 0 0",      // black on amber
      border: "120 90 65",          // warm brown
      input: "255 247 237",         // warm off-white
    },
    dark: {
      surface: "16 12 10",          // warm near-black
      panel: "26 20 16",            // warm dark panel
      textPrimary: "245 225 200",   // warm off-white
      textSecondary: "180 155 125", // warm muted
      accent: "245 158 11",         // amber-500
      accentHover: "251 191 36",    // amber-400 (lighter on hover in dark)
      accentContrast: "0 0 0",      // black on amber
      border: "245 158 11",         // amber border
      input: "12 9 7",              // warm black
    },
  },
  font: "sans",
  radius: { sm: "0.5rem", md: "0.5rem", lg: "0.75rem" },
  glass: { enabled: true, opacity: 0.9, blur: "4px" },
  branding: {
    type: "clean",
    text: "Labrynth",
    showCursor: false,
    icon: "ember",
  },
  sidebar: { activeStyle: "filled", itemPrefix: "" },
  background: "ember-circuit",
};
