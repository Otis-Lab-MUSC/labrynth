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
      },
      animation: {
        blink: "blink 1s step-end infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "btn-flash": "btn-flash 0.4s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
