# Releasing Labrynth

Releases are cut from `main` and driven by **git tags**. Two workflows handle
different audiences:

| Workflow | Trigger | Audience | GitHub Release |
|---|---|---|---|
| `build-installers.yml` | `vX.Y.Z` (stable only) | All end users | **Latest** |
| `build-prerelease.yml` | `vX.Y.Z-alpha.*`, `vX.Y.Z-beta.*`, `vX.Y.Z-rc.*` | Lab beta-testers | Pre-release |

Both workflows build the same installer formats for all platforms:

| Platform | Asset |
|---|---|
| Windows (x64) | `labrynth-*-windows-x64.exe` (Inno Setup installer) |
| macOS (Apple Silicon) | `labrynth-*-macos-arm64.dmg` |
| Linux (Debian/Ubuntu) | `labrynth_*_amd64.deb` |
| Linux (portable) | `labrynth-*-linux-x64.AppImage` |
| Linux (tarball) | `labrynth-*-linux-x64.tar.gz` |

The build installs `reacher` from source, so a Labrynth release does **not**
depend on `reacher` being on PyPI.

## Versioning semantics

| Tag pattern | Audience | Stability contract |
|---|---|---|
| `vX.Y.Z-alpha.N` | Lab-internal only | May be broken on any platform; experiments can fail silently |
| `vX.Y.Z-beta.N` | Trusted external beta-testers | All 3 platform installers must succeed; sessions must run end-to-end |
| `vX.Y.Z-rc.N` | Same as beta (final soak) | Feature-complete; data format frozen; only blocking-bug fixes |
| `vX.Y.Z` | All end users | All platforms tested; "Latest" on GitHub |

**Alpha** is permitted to fail a platform build. **Beta must produce working installers
on all platforms** — a build failure for a beta tag is a workflow error to fix, not a soft skip.

## Prerelease ladder

Prerelease builds are **not** cut via the `/release` Claude Code skill, which is
reserved for stable tags. Cut them manually:

```bash
# 1. Land changes on main via PR (CI green).
git checkout main && git pull

# 2. (Optional) Bump the reacher pin if shipping a newer backend.
python scripts/bump-version.py --reacher-pin 3.1.0-alpha.2

# 3. Bump the app version. Use --stage to advance automatically:
python scripts/bump-version.py --stage alpha    # e.g. 3.1.0-alpha.1 → 3.1.0-alpha.2
python scripts/bump-version.py --stage beta     # → 3.1.0-beta.1 (resets counter)
# Or set explicitly:
python scripts/bump-version.py 3.1.0-beta.1
python scripts/bump-version.py --check 3.1.0-beta.1

# 4. Commit, push, tag — the tag push triggers build-prerelease.yml.
git add pyproject.toml web/package.json README.md
git commit -m "release: v3.1.0-beta.1"
git push origin main
git tag -a v3.1.0-beta.1 -m "Labrynth v3.1.0-beta.1"
git push origin v3.1.0-beta.1
```

The prerelease workflow automatically derives which reacher ref to clone from the
`reacher>=` pin stored in `pyproject.toml` (via `--print-reacher-ref`). To override
this (e.g., bundle a different reacher branch), trigger the workflow manually from
the GitHub Actions UI with an explicit `reacher_ref` input.

## Cutting a stable release

Use the `/release` Claude Code skill, which will call `--validate-stable` to guard
against accidentally tagging a prerelease tree. Or manually:

```bash
# 1. Land changes on main via PR (CI green).
git checkout main && git pull

# 2. (If shipping a new backend) bump the reacher pin to a stable tag.
python scripts/bump-version.py --reacher-pin 3.1.0

# 3. Bump to stable (strips the prerelease suffix).
python scripts/bump-version.py --stage stable   # e.g. 3.1.0-rc.1 → 3.1.0
# Or set explicitly:
python scripts/bump-version.py 3.1.0
python scripts/bump-version.py --validate-stable   # guard: exits 1 if still prerelease
python scripts/bump-version.py --check 3.1.0

# 4. Commit, push, tag — the tag push triggers build-installers.yml.
git add pyproject.toml web/package.json README.md
git commit -m "release: v3.1.0"
git push origin main
git tag -a v3.1.0 -m "Labrynth v3.1.0"
git push origin v3.1.0
```

## Promoting through the ladder

A typical cycle: cut `-alpha.N` for lab testing → fix forward with new `-alpha.N+1`
tags → promote to `-beta.N` for external testers → `-rc.N` → the bare stable tag
once validated. Each tag is independent — there is no "promote" button; you re-bump
and re-tag using `--stage`.
