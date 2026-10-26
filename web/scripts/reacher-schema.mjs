/**
 * Read the reacher schema dump (`python -m reacher.schema dump --json`) for the
 * table generators in this folder.
 *
 * Source, first match wins:
 *   1. REACHER_SRC=/path/to/reacher        a reacher checkout
 *   2. REACHER_SRC=installed               the reacher2p installed for $PYTHON
 *                                          (default python3); CI installs the
 *                                          version pinned in pyproject.toml
 *   3. ../reacher beside this repo         a reacher checkout
 *   4. otherwise, as for 2
 *
 * A checkout and the matching installed wheel give the same tables: reacher
 * ships the firmware facts the generators need (`firmware_surface`) as package
 * data and tests that copy against its firmware source.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../..");

function reacherCheckout() {
  if (process.env.REACHER_SRC === "installed") return null;
  if (process.env.REACHER_SRC) return resolve(process.env.REACHER_SRC);
  const sibling = resolve(REPO_ROOT, "../reacher");
  return existsSync(resolve(sibling, "src/reacher/schema.py")) ? sibling : null;
}

/** The reacher2p version pinned in pyproject.toml (PEP 440), or null. */
export function reacherPin() {
  const text = readFileSync(resolve(REPO_ROOT, "pyproject.toml"), "utf8");
  return text.match(/"reacher2p>=([^"]+)"/)?.[1] ?? null;
}

export function loadSchema() {
  const root = reacherCheckout();
  const python = process.env.PYTHON ?? "python3";
  const opts = root
    ? { cwd: root, env: { ...process.env, PYTHONPATH: resolve(root, "src") } }
    : { cwd: REPO_ROOT, env: process.env };
  let dump;
  try {
    const raw = execFileSync(python, ["-m", "reacher.schema", "dump", "--json"], {
      ...opts,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    dump = JSON.parse(raw);
  } catch (err) {
    console.error(
      root
        ? `Could not read the reacher schema from ${root}`
        : `No reacher checkout found and \`${python} -m reacher.schema\` failed.`,
    );
    console.error(
      "Set REACHER_SRC to your reacher checkout, clone it beside this repo, or " +
        `pip install "reacher2p==${reacherPin() ?? "<pin>"}".`,
    );
    console.error(String(err.message ?? err).split("\n")[0]);
    process.exit(1);
  }
  const version = dump.generated_from?.version ?? "unknown";
  const from = root ? `checkout ${root}` : `installed reacher2p ${version}`;
  return { dump, from, version };
}
