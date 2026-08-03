---
name: release
description: Cut a stable Labrynth release after verifying the pinned reacher backend is a real, compatible release. Bumps version, validates stable, commits, tags, and pushes to trigger cross-platform installer builds. Use when the user asks to release, cut a release, or publish a new stable Labrynth version. Not for alpha/beta/rc — those are cut manually per RELEASING.md.
argument-hint: "[stable version, e.g. 3.1.0]"
model: haiku
context: fork
agent: general-purpose
background: false
allowed-tools: Agent, AskUserQuestion, Bash(git *), Bash(gh *), Bash(python scripts/bump-version.py *)
---

# Cut a stable Labrynth release

## Dispatch

First, decide which of the two cases below applies to you.

- **You are already the isolated worker for this skill** — this content reached you as the `prompt` of an `Agent` call, or you were forked directly via this skill's own `context: fork`/`model: haiku` configuration (for example, you were invoked through the `Skill` tool rather than a typed `/release` command). In that case: skip the rest of this Dispatch section and go straight to "When this skill is active" below. Do the actual work yourself, in this same turn, including using `AskUserQuestion` directly for every confirmation gate described below — do not describe readiness and stop, do not end your turn waiting to be resumed, and do not spawn another `Agent` call for any of it.
- **You are the top-level assistant in the main conversation**, and this content just arrived as a plain instruction (e.g. a typed `/release` slash command injected it directly into your turn). In that case, follow steps 1–3 below: you must not do the git/gh/version work yourself, because this path does not fork you automatically.

If genuinely unsure which case applies, prefer treating yourself as already-isolated and doing the work directly — an extra layer of delegation is worse than none.

1. Do not run any `git`, `gh`, or `python scripts/bump-version.py` command yourself in this context, and do not answer any of the confirmation gates below yourself.
2. Immediately call the `Agent` tool, once, and wait for it to finish:
   - `subagent_type: "general-purpose"`
   - `model: "haiku"`
   - `run_in_background: false`
   - `description`: a short label like "Release: labrynth stable version bump/tag"
   - `prompt`: the full text of this file from "## When this skill is active" to the end of "## Gotchas" (i.e. everything below this Dispatch section), followed by the user's original request verbatim (including the target version if given) and any relevant conversation context.
   - Because the call is synchronous, the subagent handles every confirmation gate itself via `AskUserQuestion`, getting a live answer from the user before returning. You do not relay questions or resume it — you only get back a finished result.
3. Relay the subagent's final result to the user as-is.

Everything below this point is worker instructions delegated via the `prompt` in step 2 above — it assumes it is that subagent, operating with `Bash(git *)`, `Bash(gh *)`, `Bash(python scripts/bump-version.py *)`, and `AskUserQuestion` only. Wherever these instructions say "stop and ask" or "pause for confirmation," that means call `AskUserQuestion` directly and wait for the answer — never end the turn without it.

## When this skill is active

Use this skill when the user clearly asks to cut, publish, or release a new **stable** Labrynth version.

This skill is reserved for stable releases only. If the user asks for an alpha, beta, or rc release, do not use this skill's automation — tell them prereleases are cut manually per `RELEASING.md` (bump with `--stage alpha|beta|rc`, commit, tag `vX.Y.Z-{alpha,beta,rc}.N`, push — no `--validate-stable` gate, no reacher-release-existence check) and stop.

Never start a version bump, commit, tag, or push on your own initiative — only when explicitly requested.

## Steps

### 1. Prerequisites

```bash
git branch --show-current
git status --short
git pull origin main
```

- Refuse to proceed on a detached HEAD or any branch other than `main`; ask the user to switch first.
- If `git status --short` shows unexpected changes (anything you didn't just pull), stop and report — do not proceed on a dirty tree.

### 2. Determine the target version

Take the version from the user's request (or `$ARGUMENTS`). Validate it matches `^\d+\.\d+\.\d+$` — **no prerelease suffix**. If it contains `-alpha`, `-beta`, or `-rc`, stop immediately: this skill only cuts stable releases. Tell the user to follow the manual prerelease steps in `RELEASING.md` instead.

If no version was given, or it's not a bare stable semver, ask via `AskUserQuestion` for an explicit stable target version. Do not guess or auto-increment.

Print current state for context:

```bash
python scripts/bump-version.py
```

This also prints the current `reacher pin`, which you'll need next.

### 3. Reacher compatibility check (do this before any version bump)

Labrynth's CI clones `reacher` directly from GitHub at the ref derived from the `reacher2p>=` pin — a bad or nonexistent ref breaks every platform build. Verify it now, before touching any version file.

If the user wants to ship a new backend with this release, ask (do not assume) whether to bump the pin first:

```bash
python scripts/bump-version.py --reacher-pin <reacher-semver>
```

Then resolve and verify the ref:

```bash
REF=$(python scripts/bump-version.py --print-reacher-ref)
gh release view "$REF" --repo Otis-Lab-MUSC/reacher --json tagName,isPrerelease,isDraft,publishedAt,url
```

Interpret the result:

- **Command fails (release not found)** — the pinned reacher version has no corresponding published GitHub release. Stop. Report this to the user; do not proceed. Either the pin is wrong, or the reacher release hasn't been cut yet (point them at reacher's own `/release` skill if relevant).
- **`isDraft: true`** — the release exists but isn't published. Stop, same reasoning.
- **`isPrerelease: true`** — the pinned reacher version is an alpha/beta/rc. This is unusual for a stable Labrynth build. Surface this explicitly to the user and require an explicit `AskUserQuestion` confirmation before continuing — do not silently proceed.
- **Otherwise (published, non-draft, non-prerelease)** — report the confirmed reacher version, its publish date, and its URL to the user, then continue.

### 4. Bump and validate stable

```bash
python scripts/bump-version.py <version>
python scripts/bump-version.py --validate-stable
python scripts/bump-version.py --check <version>
```

If `--validate-stable` or `--check` fails, stop and report — do not proceed to commit a version that isn't cleanly stable or isn't fully stamped.

### 5. Review and confirm the commit

```bash
git status --short
git diff --stat pyproject.toml web/package.json README.md web/README.md
```

Expected changed files: `pyproject.toml`, `web/package.json`, `README.md` (badge), and `web/README.md` if it also carries a badge. If anything else is staged/modified that you don't recognize as part of this flow, flag it before continuing.

Ask via `AskUserQuestion` to confirm before staging and committing.

### 6. Commit

```bash
git add pyproject.toml web/package.json README.md
```

Include `web/README.md` in the `git add` too if it changed. Then:

```bash
git commit -m "release: v<version>"
```

This repo's own commit history uses exactly this `release: vX.Y.Z` format for every past release — use it verbatim, not the `feat:`/`bug:`/`chore:`/`docs:` convention.

### 7. Push to main

Ask via `AskUserQuestion` to confirm before pushing (this updates the shared `main` branch).

```bash
git push origin main
```

### 8. Tag and push the tag

This is the highest-stakes step — pushing the bare `vX.Y.Z` tag triggers `build-installers.yml`, which builds and publishes installers for every platform and marks the GitHub Release as "Latest" for all end users. Ask via `AskUserQuestion` to confirm explicitly before doing this, showing the exact tag and message you're about to push, and reminding the user this immediately becomes the default download for all users.

```bash
git tag -a v<version> -m "Labrynth v<version>"
git push origin v<version>
```

### 9. Watch the build

```bash
gh run list --workflow=build-installers.yml --limit 1
```

Offer to watch it live:

```bash
gh run watch <run-id>
```

Report the outcome per platform (Windows `.exe`, macOS `.dmg`, Linux `.deb`/`.AppImage`/`.tar.gz`). Unlike the prerelease workflow, `build-installers.yml` does not use `continue-on-error` — any platform failure is a real problem to report, not a soft skip.

### 10. Final report

Summarize: version released, the confirmed reacher version it bundles (from step 3), commit hash, tag, push status, and the per-platform build outcomes from step 9.

## Hard rules

- Never cut a prerelease through this skill — reject any `-alpha`/`-beta`/`-rc` target immediately (step 2).
- Never bump, commit, tag, or push without the user having explicitly requested a release in the current conversation.
- Never skip the reacher compatibility check (step 3) — a bad pin breaks every platform build in CI, not just one.
- Never silently proceed when the pinned reacher release is a prerelease or doesn't exist — always surface it and get explicit confirmation or stop.
- Never push the release tag (step 8) without an explicit confirmation for that specific tag.
- Never use `git push --force` or any force variant.
- Never hand-edit version-bearing files directly — always go through `scripts/bump-version.py`.
- Never proceed past a `--validate-stable` or `--check` failure.

## Gotchas

- `--print-reacher-ref` reverses PEP 440 back to semver and prepends `v` (e.g. pin `>=3.3.0` → ref `v3.3.0`) — pass that value straight to `gh release view`.
- The reacher pin (`--reacher-pin`) and the Labrynth app version (plain `<version>`) are independent axes — bumping one does not bump the other. Only touch the reacher pin if the user actually wants to ship a new backend with this release.
- Labrynth has no dedicated `ci.yml` gate on `main` (only `deploy-demo.yml` runs on push) — there is no "CI green" check to run before step 1 beyond confirming the working tree is clean and up to date.
- A successful tag push is a valid completion of this skill even if you don't wait for the full CI run to finish — offer to watch it, but don't block indefinitely if the user wants to move on.
