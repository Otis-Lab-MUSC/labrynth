import type { CommandSpec } from "../../types";

/**
 * Pavlovian parameter labels and code groupings.
 *
 * The set of Pavlovian params is sourced dynamically from reacher's command
 * registry (GET /hardware/{id}/commands). This file only supplies presentation
 * concerns the registry doesn't carry: curated short labels and the UI groupings
 * (ITI block, pulse block) that have special rendering/validation.
 *
 * LABEL_OVERRIDES is intentionally non-load-bearing: a code missing here falls
 * back to the registry's `description`, then to `Code <n>`. A new registry param
 * therefore appears in the UI automatically — it just gets its description as a
 * label until someone adds a nicer override here.
 */
export const LABEL_OVERRIDES: Record<number, string> = {
  206: "CS+ Reward Prob (%)",
  207: "CS- Reward Prob (%)",
  208: "CS+ Count",
  209: "CS- Count",
  210: "CS+ Frequency (Hz)",
  211: "CS- Frequency (Hz)",
  212: "Counterbalance",
  213: "Cue Duration (ms)",
  214: "Trace Interval (ms)",
  215: "Consumption Window (ms)",
  216: "ITI Mean (ms)",
  217: "ITI Min (ms)",
  218: "ITI Max (ms)",
  219: "Pulse Config",
  374: "CS+ Pulse On (ms)",
  375: "CS+ Pulse Off (ms)",
  384: "CS- Pulse On (ms)",
  385: "CS- Pulse Off (ms)",
};

/** ITI distribution codes — rendered as a dedicated min/mean/max block. */
export const ITI_CODES = [216, 217, 218] as const;

/** Pulse-configuration codes — rendered as a dedicated block (0 = continuous). */
export const PULSE_CODES = [374, 375, 384, 385] as const;

/** Resolve a display label for a Pavlovian command code. */
export function labelForCode(code: number, specs: CommandSpec[]): string {
  if (LABEL_OVERRIDES[code]) return LABEL_OVERRIDES[code];
  const spec = specs.find((s) => s.code === code);
  if (spec?.description) return spec.description;
  return `Code ${code}`;
}
