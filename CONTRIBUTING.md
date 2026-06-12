# Contributing to Labrynth

Labrynth is the application shell (React frontend + terminal CLI + build
pipeline) for the REACHER platform. The backend and firmware live in the
separate [`reacher`](https://github.com/Otis-Lab-MUSC/reacher) package — backend
or firmware changes go there, not here. Release mechanics are in
[`RELEASING.md`](RELEASING.md).

## Branching model

`main` is the only permanent branch. It is always releasable and is the GitHub
default branch.

- Branch off `main` for all non-trivial work:
  - `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`
- Open a pull request into `main`; delete the branch after merge.
- There is **no `develop` branch** (retired June 2026 when the v3 line moved to
  a `main`-based flow).

## Versioning

Semantic versioning with an explicit prerelease ladder for testers:

```
X.Y.Z-alpha.N  (lab/internal)  →  X.Y.Z-beta.N  (external testers)  →  X.Y.Z-rc.N  →  X.Y.Z  (stable)
```

The old `-dev` suffix is **retired** as of v3.0.0.

- **Never hand-edit version strings.** They are kept in sync across
  `pyproject.toml` and `web/package.json` by:
  ```bash
  python scripts/bump-version.py 3.1.0-alpha.1
  python scripts/bump-version.py --check 3.1.0-alpha.1   # CI uses this
  ```
- `__APP_VERSION__` is injected at Vite build time from `web/package.json` and
  shown in the app footer.

## Firmware / backend version

Labrynth ships the firmware and backend by depending on `reacher`. To move to a
newer firmware/backend, bump the pin in `pyproject.toml`
(`reacher>=X.Y.Z`) — do not vendor or submodule firmware here.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(session): add per-device onset delay field
fix(ws): recover missed events on reconnect
chore(web): bump vite to 6
```

## Before opening a PR

There is no test framework here by design — ESLint is the automated check:

```bash
cd web && npm run lint
```

Verify behavior by running the dev server (`npm run dev`) against a live
`reacher` backend.
