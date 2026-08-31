#!/usr/bin/env node
/**
 * Regenerate src/generated/firmwareGaps.ts from the reacher schema dump.
 *
 * Firmware gaps are commands the UI can send that some paradigms' firmware does
 * not handle. The gate that disables such a control must be derived from
 * reacher's KNOWN_FIRMWARE_GAPS, never hand-written — a hand-written gate keeps
 * refusing after the firmware gap is closed.
 *
 * Usage:  npm run gen:gaps                    (expects ../reacher beside this repo)
 *         REACHER_SRC=/path/to/reacher npm run gen:gaps
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../src/generated/firmwareGaps.ts");
const reacherRoot = process.env.REACHER_SRC ?? resolve(here, "../../../reacher");

let dump;
try {
  const raw = execFileSync("python3", ["-m", "reacher.schema", "dump", "--json"], {
    cwd: reacherRoot,
    env: { ...process.env, PYTHONPATH: resolve(reacherRoot, "src") },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  dump = JSON.parse(raw);
} catch (err) {
  console.error(`Could not read the reacher schema from ${reacherRoot}`);
  console.error("Set REACHER_SRC to your reacher checkout, or clone it beside this repo.");
  console.error(String(err.message ?? err).split("\n")[0]);
  process.exit(1);
}

const gaps = dump?.python?.known_firmware_gaps;
if (!gaps || typeof gaps !== "object") {
  console.error("Schema dump has no python.known_firmware_gaps — refusing to write an empty gate.");
  process.exit(1);
}

const version = dump.generated_from?.version ?? "unknown";
const body = Object.entries(gaps)
  .map(([cmd, g]) => {
    const paradigms = g.paradigms.map((p) => JSON.stringify(p)).join(", ");
    return `  ${cmd}: {
    paradigms: [${paradigms}] as readonly string[],
    reason: ${JSON.stringify(g.reason)},
    uiGuidance: ${JSON.stringify(g.ui_guidance)},
  },`;
  })
  .join("\n");

writeFileSync(
  OUT,
  `// GENERATED FILE — do not edit by hand.
// Source: reacher ${version}, python.known_firmware_gaps
// Regenerate: npm run gen:gaps
//
// Commands the UI can send that some paradigms' firmware does not handle.
// Controls for these must be disabled (not hidden) on the listed paradigms.

export interface FirmwareGap {
  /** Exact paradigm strings, including "_lite" twins — compare the raw value. */
  paradigms: readonly string[];
  /** Why firmware does not handle it, and what happens if it is sent anyway. */
  reason: string;
  /** How the UI should present the gap. */
  uiGuidance: string;
}

export const FIRMWARE_GAPS = {
${body}
} as const satisfies Record<string, FirmwareGap>;

/** True when \`paradigm\` is one the given command is silently unhandled on. */
export function hasFirmwareGap(
  gap: FirmwareGap,
  paradigm: string | null | undefined,
): boolean {
  return !!paradigm && gap.paradigms.includes(paradigm);
}
`,
  "utf8",
);
console.log(`Wrote ${OUT} (${Object.keys(gaps).length} gap(s), reacher ${version})`);
