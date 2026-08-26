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
      surface: "4 9 10",
      panel: "11 20 20",
      textPrimary: "200 232 232",
      textSecondary: "157 189 189",
      accent: "0 229 255",
      accentHover: "51 236 255",
      accentContrast: "4 9 10",
      border: "42 74 73",
      input: "2 6 7",
      textDim: "122 156 156",
    },
  },
  font: "mono",
  radius: { sm: "2px", md: "2px", lg: "2px" },
  glass: { enabled: false, opacity: 1, blur: "0px" },
  branding: {
    type: "clean",
    text: "// Labrynth",
    showCursor: false,
    icon: "reacher",
  },
  sidebar: { activeStyle: "left-accent", itemPrefix: "" },
  background: "cyberpunk-grid",
};
