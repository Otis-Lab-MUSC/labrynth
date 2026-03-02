import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
        },
        panel: {
          DEFAULT: "rgb(var(--color-panel) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          contrast: "rgb(var(--color-accent-contrast) / <alpha-value>)",
        },
        theme: {
          border: "rgb(var(--color-border) / 0.12)",
          text: "rgb(var(--color-text-primary) / <alpha-value>)",
        },
        input: "rgb(var(--color-input) / <alpha-value>)",
      },
      boxShadow: {
        glow: "0 0 12px rgb(var(--color-accent) / 0.25)",
        "glow-sm": "0 0 6px rgb(var(--color-accent) / 0.15)",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "bolt-flicker": {
          "0%, 90%, 100%": { opacity: "0.8" },
          "93%": { opacity: "0.3" },
          "96%": { opacity: "0.9" },
          "98%": { opacity: "0.4" },
        },
        "ember-sway": {
          "0%, 100%": { transform: "rotate(0deg) scale(1)" },
          "25%": { transform: "rotate(-2deg) scale(1.03)" },
          "75%": { transform: "rotate(2deg) scale(0.97)" },
        },
        "reacher-glow": {
          "0%, 100%": { filter: "drop-shadow(0 0 3px rgb(var(--color-accent) / 0.3))" },
          "50%": { filter: "drop-shadow(0 0 8px rgb(var(--color-accent) / 0.6))" },
        },
        "laser-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-25%)" },
        },
        "mouse-run": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(25deg)" },
          "75%": { transform: "rotate(-25deg)" },
        },
        "status-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(0.92)" },
        },
      },
      animation: {
        blink: "blink 1s step-end infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "btn-flash": "btn-flash 0.4s ease-out",
        "bolt-flicker": "bolt-flicker 3s ease-in-out infinite",
        "ember-sway": "ember-sway 2s ease-in-out infinite",
        "reacher-glow": "reacher-glow 3s ease-in-out infinite",
        "laser-scroll": "laser-scroll 1s linear infinite",
        "mouse-run": "mouse-run 0.3s ease-in-out infinite",
        "status-pulse": "status-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
