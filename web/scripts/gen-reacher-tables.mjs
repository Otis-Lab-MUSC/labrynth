#!/usr/bin/env node
/**
 * Regenerate the tables labrynth mirrors from reacher, from its schema dump:
 *
 *   src/generated/pinTables.ts    component keys, SET_PIN codes, role constraints,
 *                                 default pins (Pins.h) and board pin sets
 *   src/generated/deviceNames.ts  device names per layer (firmware config, and
 *                                 what reaches the browser after the kernel)
 *   src/generated/commandCodes.ts serial command codes by registry name
 *   ../cli/reacher_tables.py      the same command codes for the terminal CLI
 *
 * Hand-written rules *between* devices (which interrupt pins are free, the grid
 * order, labels) stay in the files that import these.
 *
 * Usage:  npm run gen:tables   (reacher source: see scripts/reacher-schema.mjs)
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSchema, REPO_ROOT } from "./reacher-schema.mjs";

const { dump, from } = loadSchema();
const py = dump.python ?? {};
const surface = dump.firmware_surface ?? {};

function need(ok, what) {
  if (!ok) {
    console.error(
      `Schema dump has no ${what} — refusing to write an empty table. ` +
        "It needs a reacher with firmware_surface and pin_constraints[].mega_only; " +
        "bump the reacher2p pin or point REACHER_SRC at a newer checkout.",
    );
    process.exit(1);
  }
}
need(Array.isArray(py.pin_constraints) && py.pin_constraints.length >= 8, "python.pin_constraints");
need(py.pin_constraints.every((c) => "mega_only" in c), "pin_constraints[].mega_only");
need(py.pin_sets && Object.keys(py.pin_sets).length >= 2, "python.pin_sets");
need(py.command_code_enum && Object.keys(py.command_code_enum).length >= 50, "python.command_code_enum");
need(surface.source && surface.pins_h && surface.device_names, "firmware_surface");

// Stamp the schema version only, as gen-firmware-gaps.mjs does: the release
// version would churn every file on each reacher bump and break the CI drift
// gate; the release itself is recorded by the reacher2p pin.
const header = (comment, sources, regenerate = "npm run gen:tables") =>
  [
    `${comment} GENERATED FILE — do not edit by hand.`,
    `${comment} Source: reacher schema v${dump.schema_version ?? "unknown"}, ${sources}`,
    `${comment} (which reacher release: see the reacher2p pin in pyproject.toml)`,
    `${comment} Regenerate: ${regenerate}`,
  ].join("\n");

const write = (rel, text) => {
  const out = resolve(REPO_ROOT, rel);
  writeFileSync(out, text, "utf8");
  console.log(`Wrote ${rel}`);
};

// --- Pin tables -------------------------------------------------------------

const constraints = py.pin_constraints;
const keys = constraints.map((c) => c.component_key);
const pinOf = Object.fromEntries(
  Object.entries(surface.pin_symbol_to_component).map(([sym, key]) => [key, surface.pins_h[sym]]),
);
need(keys.every((k) => Number.isInteger(pinOf[k])), "a Pins.h default for every component");

const record = (name, type, value) =>
  `export const ${name}: Record<Component, ${type}> = {\n` +
  constraints.map((c) => `  ${c.component_key}: ${value(c)},`).join("\n") +
  "\n};\n";
const list = (pins) => `[${pins.join(", ")}]`;
const boards = Object.keys(py.pin_sets).sort();
const boardSets = boards
  .map((b) => {
    const s = py.pin_sets[b];
    const B = b.toUpperCase();
    return [
      `export const ${B}_DIGITAL: readonly number[] = ${list(s.digital)};`,
      `export const ${B}_PWM = new Set(${list(s.pwm)});`,
      `export const ${B}_INT: readonly number[] = ${list(s.interrupt)};`,
      `export const ${B}_PCINT0: readonly number[] = ${list(s.pcint0)};`,
    ].join("\n");
  })
  .join("\n\n");

write(
  "web/src/generated/pinTables.ts",
  `${header("//", "python.pin_constraints, python.pin_sets,\n//   firmware_surface.pins_h")}
//
// Re-exported by components/hardware/pinMeta.ts. reacher's frontend parity
// checks parse these declarations by name (mcp/sources/ts.py).

/** Canonical, lowercase component keys (pin_overrides.PIN_CONSTRAINTS). */
export type Component =
${keys.map((k) => `  | ${JSON.stringify(k)}`).join("\n")};

/** SET_PIN command codes (suffix x76). */
${record("SET_PIN_CODE", "number", (c) => c.code)}
/** Firmware default pins (Pins.h). */
${record("DEFAULT_PIN", "number", (c) => pinOf[c.component_key])}
/** Components whose pins must support hardware PWM. */
${record("COMPONENT_REQUIRES_PWM", "boolean", (c) => c.requires_pwm)}
/** Components restricted to the PCINT0/PORTB group. */
${record("COMPONENT_REQUIRES_PCINT", "boolean", (c) => c.requires_pcint)}
/** Components restricted to pins carrying an external-interrupt line. */
${record("COMPONENT_REQUIRES_INT", "boolean", (c) => c.requires_interrupt)}
/** Components that only exist on the Mega; absent means every board. */
export const COMPONENT_MEGA_ONLY: Partial<Record<Component, boolean>> = {
${constraints.filter((c) => c.mega_only).map((c) => `  ${c.component_key}: true,`).join("\n")}
};

// Board pin sets (pin_overrides.board_sets). *_INT is the full interrupt set;
// which of those a component may take is a rule in pinMeta.ts.

${boardSets}
`,
);

// --- Device names -----------------------------------------------------------

const names = surface.device_names;
const nameList = (exportName, typeName, values, doc) =>
  `/** ${doc} */\nexport const ${exportName} = [\n${values.map((v) => `  ${JSON.stringify(v)},`).join("\n")}\n] as const;\n` +
  `export type ${typeName} = (typeof ${exportName})[number];\n`;

write(
  "web/src/generated/deviceNames.ts",
  `${header("//", "firmware_surface.device_names")}
//
// Firmware spells devices differently per log level, and the kernel rewrites
// some names before the browser sees them. Compare a WebSocket event's device
// against EventDevice, a config record's against ConfigDevice; never mix them.

${nameList(
  "EVENT_DEVICES",
  "EventDevice",
  names.post_kernel,
  "`device` of a WebSocket 'event' message: firmware level 007 after the kernel's rewrites, plus SLM (level 009).",
)}
${nameList(
  "CONFIG_DEVICES",
  "ConfigDevice",
  names.config,
  "`device` of a firmware config record (level 000), as in /api/hardware/{id}/config `hardware_settings`.",
)}`,
);

// --- Command codes ----------------------------------------------------------

const codes = Object.entries(py.command_code_enum).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));

write(
  "web/src/generated/commandCodes.ts",
  `${header("//", "python.command_code_enum")}

/** Serial command codes by registry name (reacher kernel/commands.py CommandCode). */
export const CMD = {
${codes.map(([name, code]) => `  ${name}: ${code},`).join("\n")}
} as const;

export type CommandName = keyof typeof CMD;
`,
);

write(
  "cli/reacher_tables.py",
  `${header("#", "python.command_code_enum", "npm run gen:tables (in web/)")}
"""Serial command codes by registry name (reacher kernel/commands.py CommandCode)."""

CMD: dict[str, int] = {
${codes.map(([name, code]) => `    ${JSON.stringify(name)}: ${code},`).join("\n")}
}
`,
);

console.log(`(from ${from})`);
