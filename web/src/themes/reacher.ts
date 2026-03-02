import type { ThemeDefinition } from "./types";

export const reacherTheme: ThemeDefinition = {
  id: "reacher",
  name: "Reacher",
  colors: {
    light: {
      surface: "250 253 253",       // cool cyan-tinted white
      panel: "238 248 248",         // light teal panel
      textPrimary: "10 20 20",      // near-black
      textSecondary: "70 100 100",  // muted teal
      accent: "0 180 182",          // brand cyan (light-adapted)
      accentHover: "0 145 148",     // dimmed cyan
      accentContrast: "0 0 0",      // black on cyan
      border: "70 100 100",         // muted teal border
      input: "245 251 251",         // near-white
    },
    dark: {
      surface: "10 10 10",          // near-black (brand banner bg)
      panel: "14 18 20",            // blue-gray lift
      textPrimary: "210 245 245",   // cyan-tinted white
      textSecondary: "120 175 175", // muted teal
      accent: "0 212 216",          // brand cyan (exact logo)
      accentHover: "0 175 180",     // dimmed cyan
      accentContrast: "0 0 0",      // black on cyan
      border: "0 212 216",          // cyan border
      input: "6 8 10",              // near-black input
    },
  },
  font: "mono",
  radius: { sm: "0.375rem", md: "0.375rem", lg: "0.625rem" },
  glass: { enabled: true, opacity: 0.85, blur: "6px" },
  branding: {
    type: "clean",
    text: "Labrynth",
    showCursor: false,
    icon: "reacher",
  },
  sidebar: { activeStyle: "left-accent", itemPrefix: "" },
  background: "neon-grid",
};
