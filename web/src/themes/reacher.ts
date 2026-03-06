import type { ThemeDefinition } from "./types";

export const reacherTheme: ThemeDefinition = {
  id: "reacher",
  name: "Reacher",
  colors: {
    light: {
      surface: "240 248 248",
      panel: "225 238 238",
      textPrimary: "10 30 30",
      textSecondary: "74 112 112",
      accent: "0 180 200",
      accentHover: "0 140 155",
      accentContrast: "0 0 0",
      border: "180 210 210",
      input: "232 244 244",
      textDim: "120 160 160",
    },
    dark: {
      surface: "0 0 0",
      panel: "10 24 24",
      textPrimary: "200 232 232",
      textSecondary: "74 112 112",
      accent: "0 229 255",
      accentHover: "0 122 140",
      accentContrast: "0 0 0",
      border: "13 38 38",
      input: "4 10 10",
      textDim: "40 80 80",
    },
  },
  font: "cyberpunk",
  radius: { sm: "2px", md: "2px", lg: "2px" },
  glass: { enabled: true, opacity: 0.85, blur: "6px" },
  branding: {
    type: "clean",
    text: "// Labrynth",
    showCursor: false,
    icon: "reacher",
  },
  sidebar: { activeStyle: "left-accent", itemPrefix: "" },
  background: "cyberpunk-grid",
};
