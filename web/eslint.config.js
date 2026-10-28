import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "*.tsbuildinfo"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // react-hooks v6 ships three rules that fire widely on this codebase's
      // existing hooks (set-state-in-effect 16, refs 4, purity 2). Each needs a
      // real refactor with behaviour review, so they are warnings for now — a
      // triage backlog, not an assertion that the code is correct. Promote to
      // "error" as they are worked off.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      // Underscore-prefixed bindings are the established convention here for
      // deliberately-discarded values (e.g. `const { testMode: _, ...hardware }`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Style gates; existing hits are recorded by scripts/style-baseline.py.
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", 15],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
    },
  },
  {
    // Generated from reacher's schema; size is not ours to split.
    files: ["src/generated/**"],
    rules: { "max-lines": "off" },
  },
  {
    // Vite/Node-side config files run outside the browser.
    files: ["*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
