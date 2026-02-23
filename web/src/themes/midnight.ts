import type { ThemeDefinition } from "./types";

export const midnightTheme: ThemeDefinition = {
  id: "midnight",
  name: "Midnight",
  colors: {
    light: {
      surface: "248 250 255",       // cool white
      panel: "237 242 251",         // cool light blue-gray
      textPrimary: "15 23 42",      // dark slate
      textSecondary: "71 85 105",   // slate
      accent: "6 182 212",          // cyan-500
      accentHover: "8 145 178",     // cyan-600
      accentContrast: "0 0 0",      // black on cyan
      border: "71 85 105",          // slate
      input: "241 245 249",         // light slate
    },
    dark: {
      surface: "8 12 24",           // deep navy
      panel: "14 20 38",            // dark navy panel
      textPrimary: "200 220 240",   // cool light blue-white
      textSecondary: "120 150 185", // muted blue
      accent: "0 200 220",          // bright cyan
      accentHover: "0 165 185",     // medium cyan
      accentContrast: "0 0 0",      // black on cyan
      border: "0 200 220",          // cyan border
      input: "6 10 20",             // very dark navy
    },
  },
  font: "mono",
  radius: { sm: "0.375rem", md: "0.375rem", lg: "0.625rem" },
  glass: { enabled: true, opacity: 0.85, blur: "6px" },
  branding: {
    type: "clean",
    text: "REACHER",
    showCursor: false,
    icon: null,
  },
  sidebar: { activeStyle: "left-accent", itemPrefix: "" },
  background: "storm-synapse",
};
