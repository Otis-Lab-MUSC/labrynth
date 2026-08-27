# In-app issue reporting

Labrynth can turn a researcher’s plain-language description plus a compact
slice of the current diagnostic run log into a structured GitHub issue. The
summarizer is a bundled `llama.cpp` binary and a Qwen2.5-1.5B GGUF — there is
no cloud LLM key. Filing the issue on GitHub is optional and **operator
configured**.

## Operator setup (lab machines)

Set these on each rig that should file issues. They are **not** baked into the
installer.

```bash
export REACHER_GITHUB_TOKEN=github_pat_...   # fine-grained PAT
export REACHER_GITHUB_OWNER=Otis-Lab-MUSC    # optional; this is the default
```

Token scopes:

- Resource: `Otis-Lab-MUSC/labrynth` and `Otis-Lab-MUSC/reacher`
- Permission: **Issues: Read and write** (enough to create issues and labels)

On Windows, set the same variables in the user or system environment, or in
whatever wrapper starts Labrynth.

If the token is unset, About → Report an issue still runs the local model and
lets the user copy the generated markdown. Submit-to-GitHub is disabled.

The GUI installer sets `REACHER_LLM_BIN` and `REACHER_LLM_MODEL` automatically
from the frozen `llm/` directory. Dev-from-source builds do not ship the GGUF;
either point those two variables at a local `llama-completion` + GGUF, or the report
endpoint returns 503.

## What gets sent to GitHub

A capped excerpt of the current run: process meta (versions, platform), error
and warning records, recent UI events, and session lifecycle. **Not** the full
diagnostics ZIP.

Field values in the log are recorded verbatim (subject IDs, doses, paths). The
report modal discloses this. Treat a filed issue as sensitive as the experiment
data.

## Backend requirement

`POST /api/issues/report` and `GET /api/issues/status` live in **reacher**.
Until a reacher release that includes those routes is published to PyPI, run
Labrynth against an editable install:

```bash
pip install -e ../reacher
```

Then, after that reacher version is on PyPI, pin it here with:

```bash
python scripts/bump-version.py --reacher-pin <reacher-semver>
```

Do not hand-edit `pyproject.toml`.

## Installer notes

`python build.py` downloads a pinned llama.cpp CPU archive and the Qwen2.5-1.5B
Q4_K_M GGUF into `.llm-dist/` (SHA-256 verified) and copies them into the GUI
bundle. Use `--skip-llm` for a fast local GUI build without the ~1.1 GB model.
`build.py --cli-only` never bundles the LLM.

GitHub release assets must stay under 2 GB; the 1.5B Q4 model is the size
ceiling for that reason.
