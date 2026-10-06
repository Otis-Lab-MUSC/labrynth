#!/usr/bin/env python3
"""Fail if the CLI's presets/command tables drift from the web UI's.

The terminal CLI (cli/presets.py) carries a Python copy of the web's session
presets and the command tables that apply them. This script bundles the
TypeScript sources with esbuild (already a web/ dev dependency), evaluates
them in node, and diffs the result against the Python copy by VALUE — a
same-named preset with a different delay is exactly the drift it exists to
catch.

Usage (after `npm ci` in web/):
    python scripts/check-cli-parity.py

Exit 0 = in sync, 1 = drift (details printed), 2 = could not run.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
ESBUILD = os.path.join(WEB, "node_modules", ".bin", "esbuild")

# Import the individual preset modules, not presets/index.ts: the index also
# re-exports React components, which would drag JSX/CSS into the bundle.
ENTRY = """
import * as sa from "./src/components/program/presets/frSaPresets";
import * as lite from "./src/components/program/presets/frLitePresets";
import * as pav from "./src/components/program/presets/pavlovianPresets";
import * as dp from "./src/components/program/devicePresets";
const presets = [
  sa.SA_HIGH_PRESET, sa.SA_MID_PRESET, sa.SA_LOW_PRESET, sa.SA_EXTINCTION_PRESET,
  lite.SA_HIGH_LITE_PRESET, lite.SA_MID_LITE_PRESET, lite.SA_LOW_LITE_PRESET, lite.SA_EXTINCTION_LITE_PRESET,
  pav.PAV_ACQUISITION_PRESET, pav.PAV_REVERSAL_PRESET,
];
console.log(JSON.stringify({
  presets,
  presetCommandMap: dp.PRESET_COMMAND_MAP,
  laserModeCommands: dp.LASER_MODE_COMMANDS,
  pavLaserPhaseCommands: dp.PAV_LASER_PHASE_COMMANDS,
  paramParadigms: dp.PARAM_PARADIGMS,
}));
"""

# Fields that define what a preset does to the board. Display-only fields
# (devices list, descriptions) are not compared.
PRESET_FIELDS = ("id", "name", "paradigm", "hardware", "paradigmSettings", "limitDefaults", "pavlovianParams")


def load_web() -> dict:
    if not os.path.exists(ESBUILD):
        print(f"esbuild not found at {ESBUILD} — run `npm ci` in web/ first", file=sys.stderr)
        sys.exit(2)
    with tempfile.NamedTemporaryFile("w", suffix=".ts", dir=WEB, delete=False) as f:
        f.write(ENTRY)
        entry = f.name
    try:
        bundle = subprocess.run(
            [ESBUILD, entry, "--bundle", "--platform=node", "--format=cjs", "--log-level=error"],
            cwd=WEB, capture_output=True, text=True, check=True,
        ).stdout
        out = subprocess.run(["node"], input=bundle, capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError as exc:
        print(f"Bundling/evaluating web presets failed:\n{exc.stderr}", file=sys.stderr)
        sys.exit(2)
    finally:
        os.unlink(entry)
    return json.loads(out)


def normalize(v):
    """JSON round-trip so int-keyed dicts (pavlovianParams) compare as str keys."""
    return json.loads(json.dumps(v, sort_keys=True))


def diff(path: str, web, cli, out: list[str]) -> None:
    if isinstance(web, dict) and isinstance(cli, dict):
        for k in sorted(set(web) | set(cli)):
            if k not in cli:
                out.append(f"{path}.{k}: missing in CLI (web = {json.dumps(web[k])})")
            elif k not in web:
                out.append(f"{path}.{k}: CLI-only (cli = {json.dumps(cli[k])})")
            else:
                diff(f"{path}.{k}", web[k], cli[k], out)
    elif web != cli:
        out.append(f"{path}: web = {json.dumps(web)}, cli = {json.dumps(cli)}")


def main() -> int:
    # No .pyc: a cached cli/presets bytecode with a same-second mtime can mask
    # the edit being checked.
    sys.dont_write_bytecode = True
    sys.path.insert(0, ROOT)
    from cli import presets as P  # noqa: E402

    web = load_web()
    problems: list[str] = []

    web_ids = [p["id"] for p in web["presets"]]
    cli_ids = [p["id"] for p in P.SESSION_PRESETS]
    if web_ids != cli_ids:
        problems.append(f"preset list: web = {web_ids}, cli = {cli_ids}")

    cli_by_id = {p["id"]: p for p in P.SESSION_PRESETS}
    for wp in web["presets"]:
        cp = cli_by_id.get(wp["id"])
        if cp is None:
            continue
        for field in PRESET_FIELDS:
            diff(f"{wp['id']}.{field}", normalize(wp.get(field)), normalize(cp.get(field)), problems)

    for name, web_key, cli_val in (
        ("PRESET_COMMAND_MAP", "presetCommandMap", P.PRESET_COMMAND_MAP),
        ("LASER_MODE_COMMANDS", "laserModeCommands", P.LASER_MODE_COMMANDS),
        ("PAV_LASER_PHASE_COMMANDS", "pavLaserPhaseCommands", P.PAV_LASER_PHASE_COMMANDS),
        ("PARAM_PARADIGMS", "paramParadigms", P.PARAM_PARADIGMS),
    ):
        diff(name, normalize(web[web_key]), normalize(cli_val), problems)

    if problems:
        print(f"CLI/web parity check FAILED ({len(problems)} differences):")
        for p in problems:
            print(f"  - {p}")
        print("\nUpdate cli/presets.py to match the web definitions (or vice versa).")
        return 1
    print(f"CLI/web parity OK: {len(cli_ids)} presets, command tables in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
