# In-app issue reporting

Labrynth turns a researcher's plain-language description plus a compact slice of
the current diagnostic run log into a pre-filled GitHub "New Issue" link. The
researcher opens that link, reviews the issue in their own browser, and submits
it under their own GitHub account.

There is no LLM in this flow, no GitHub token on the rig, and no service to
deploy — the backend only builds a URL.

## The flow

1. About → *Report an issue* → describe the problem in plain language, with
   optional steps to reproduce, severity, and target repo.
2. **Continue** POSTs `/api/issues/prefill`, which composes the title, Markdown
   body, and labels and returns a `github.com/<owner>/<repo>/issues/new?…` URL.
3. The modal shows the composed issue and a **Continue on GitHub** link. Opening
   it lands the researcher on GitHub's new-issue form, pre-filled. Both target
   repos are public, so this is the moment to scrub subject IDs, doses, or
   paths before pressing *Create*.

Nothing reaches GitHub until the researcher submits the form themselves.
`/api/issues/prefill` makes no network or subprocess calls of its own.

## What gets sent to GitHub

A capped excerpt of the current run: process meta (versions, platform), error
and warning records, recent UI events, and session lifecycle. **Not** the full
diagnostics ZIP. reacher sizes the excerpt so the encoded URL stays within a
safe length budget.

Field values in the log are recorded verbatim (subject IDs, doses, paths). The
report modal discloses this, and the researcher sees the full body before
opening the link. **Both target repositories are public** — treat a filed issue
as sensitive as the experiment data behind it.

## Backend requirement

`POST /api/issues/prefill` lives in **reacher**. It replaces the earlier
`GET /api/issues/status`, `POST /api/issues/report`, and `POST /api/issues/file`
endpoints, along with the local summarizer, the direct-PAT filing path, and the
Cloudflare Worker relay (`services/issue-relay/`), all of which are gone.

Until a reacher release carrying `/prefill` is on PyPI, run Labrynth against an
editable install:

```bash
pip install -e ../reacher
```

Then pin it here with:

```bash
python scripts/bump-version.py --reacher-pin <reacher-semver>
```

Do not hand-edit `pyproject.toml`.

## Demo mode

The demo build has no backend, so `DemoMachineApiClient` composes the same
pre-filled GitHub URL client-side, minus the diagnostic excerpt.
