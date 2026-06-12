# Releasing Labrynth

Releases are cut from `main` and driven by **git tags**. Pushing a `v*.*.*` tag
triggers `.github/workflows/build-installers.yml`, which version-checks the tag,
builds installers for every platform, and publishes a GitHub Release with the
assets attached:

| Platform | Asset |
|---|---|
| Windows (x64) | `labrynth-*-windows-x64.exe` (Inno Setup installer) |
| macOS (Apple Silicon) | `labrynth-*-macos-arm64.dmg` |
| Linux (Debian/Ubuntu) | `labrynth_*_amd64.deb` |
| Linux (portable) | `labrynth-*-linux-x64.AppImage` |

The build installs `reacher` from source, so a Labrynth release does **not**
depend on `reacher` being on PyPI.

## Prerelease ladder

| Channel | Tag example | Audience | GitHub Release |
|---|---|---|---|
| Alpha | `v3.1.0-alpha.1` | Lab / internal | Pre-release |
| Beta | `v3.1.0-beta.1` | Trusted external testers | Pre-release |
| Release candidate | `v3.1.0-rc.1` | Final validation | Pre-release |
| Stable | `v3.1.0` | General use | Latest |

The workflow marks a release as a prerelease when the tag contains `-alpha`,
`-beta`, or `-rc`. Testers download the newest **pre-release** from the
[releases page](https://github.com/Otis-Lab-MUSC/labrynth/releases); stable
builds appear under **Latest**.

## Cutting a release

Prereleases may be cut freely. **Stable releases are cut only from `main` after
CI is green.**

```bash
# 1. Land changes on main via PR (CI green).
git checkout main && git pull

# 2. (If shipping a new backend/firmware) bump the reacher pin in pyproject.toml.

# 3. Bump + verify the app version (never hand-edit).
python scripts/bump-version.py 3.1.0-beta.1
python scripts/bump-version.py --check 3.1.0-beta.1

# 4. Commit, push, tag.
git add -A && git commit -m "release: v3.1.0-beta.1"
git push origin main
git tag -a v3.1.0-beta.1 -m "Labrynth v3.1.0-beta.1"
git push origin v3.1.0-beta.1     # ← triggers the installer build + release
```

## Promoting through the ladder

A typical cycle: cut `-alpha.N` for lab testing, fix forward with new
`-alpha.N+1` tags, promote to `-beta.N` for external testers, then `-rc.N`, then
the bare stable tag once validated. Each tag is independent — there is no
"promote" button; you re-bump and re-tag.
