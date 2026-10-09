# Desktop shell (Electron)

The desktop shell runs Labrynth in its own window. It lives in `desktop/` and is the default
launch for the Linux `.deb` and `.AppImage` packages. The browser build is still available
(`labrynth --browser`, see [Browser fallback](#browser-fallback)). Currently Linux only.

## What it is

- The Electron main process owns the REACHER backend. It starts the backend as a child
  process, or attaches to one that is already running. It stops only the backend it started.
- The window loads `http://localhost:<port>` (default 6229). That is the same origin as the
  browser build, so the token flow is unchanged: the frontend still calls
  `GET /api/auth/token` with `X-Reacher-App: 1`, and CORS is unchanged.
- Hardware and experiment logic stay in the Python backend (`reacher`). The shell adds no
  backend API.

The interfaces the modules implement are frozen in `desktop/src/contracts.ts`.

## Startup

1. **Single instance.** The shell takes Electron's single-instance lock. A second launch
   exits, and the first instance brings its window to the front.
2. **Attach or spawn.** The shell probes `GET /health` on the port.
   - If it answers with `service: "reacher"`, the shell attaches to that backend. It never
     stops a backend it did not start.
   - If another program accepts connections on the port, the shell shows a fatal dialog
     ("Port N is already used by another program") and quits. Set `REACHER_PORT` to a free
     port.
   - Otherwise it spawns the backend with `REACHER_NO_BROWSER=1` and `REACHER_PORT=<port>`:
     - Packaged: `<resources>/backend/Labrynth`.
     - Dev: `$LABRYNTH_PYTHON`, else `<repo>/.venv/bin/python`, else `python3`, running
       `launcher.py`.
3. **Loading page.** While the backend starts, the window shows a "Starting Labrynth…" page.
   Readiness means `/health` answers with `service: "reacher"`. The shell polls every 250 ms
   for up to 30 s, then loads the app.
4. **Startup failure.** If the spawned backend exits or is not ready within 30 s, the shell
   shows an error dialog that names the log file, then quits.

## Closing

| Situation | Window close button | System quit (SIGINT, SIGTERM, logout, `app.quit`) |
|---|---|---|
| Spawned backend, no active session | Backend stopped: SIGINT, then SIGKILL if still alive after 10 s. Shell quits. | Same as the window close button, without a dialog. |
| Spawned backend, session `running`, `paused` or `uploading` | Dialog. **Keep open** (default): window stays. **Close window, keep recording**: backend keeps running, shell quits, and relaunching attaches to it. | No dialog. The session is detached and keeps running. |
| Attached backend (started by something else) | Shell stops polling and quits. Backend is left running. | Same. |

Notes:

- Only the window close button can show a dialog. Signal and logout quits go through
  `before-quit` without a modal, because a modal there would block system shutdown. They
  never stop an active session.
- Active states are checked with `GET /api/sessions`. If that check fails (token or
  `/api/sessions` unreachable), the shell treats it as "a session may be running": the close
  button shows the dialog, and a system quit leaves the backend running. A failed check never
  stops a backend.

## Backend exits on its own

- A spawned backend that exits with code 0 (idle watchdog, in-app updater) makes the shell
  quit.
- Any other exit of a spawned backend shows "The REACHER backend stopped unexpectedly" with
  **Restart backend** (default) and **Quit**. Restart reloads the loading page and starts a
  new backend.
- An attached backend is treated as lost after 3 consecutive failed `/health` polls, 5 s
  apart. The same dialog then appears.
- If the renderer process crashes, the window reloads. Reloads are throttled to one per 10 s.

## Browser fallback

- `labrynth --browser` starts the backend detached, without `REACHER_NO_BROWSER`, so the
  backend opens the system browser itself. The shell then exits without opening a window.
- The browser-mode tarball (`labrynth-<version>-linux-x64.tar.gz`) contains the raw backend
  bundle. Running it directly opens the browser UI, as before.

## Frontend integration

- `window.labrynthDesktop` is set by `desktop/src/preload.ts` through `contextBridge`:
  `{ isDesktop: true, platform, version }`. Nothing else is exposed. The web app reads it
  through `isDesktop()` and `desktopInfo()` in `web/src/desktop.ts`.
- `useBeforeUnload` is a no-op in desktop mode: it neither vetoes the close nor sends the
  shutdown request. The window also ignores beforeunload vetoes (`will-prevent-unload`).
- Links that open a new window, such as About → GitHub and Report an issue, go to the system
  browser. `window.open` is denied in-app.
- Navigation to any origin other than the app origin is blocked. http(s) URLs are handed to
  the system browser.
- Sandbox: `contextIsolation` on, `sandbox` on, `nodeIntegration` off.

## Environment variables

| Variable | Used by | Effect |
|---|---|---|
| `REACHER_PORT` | shell, backend | Port to listen on (default 6229). An invalid value falls back to 6229 and logs a line. |
| `LABRYNTH_USER_DATA` | shell | Overrides Electron's `userData` directory. The log directory moves with it. |
| `LABRYNTH_PYTHON` | shell (dev only) | Python interpreter for `launcher.py`. Ignored in packaged builds. |

The shell sets `REACHER_NO_BROWSER=1` for a backend it spawns.

## Logs

- Backend stdout and stderr go to `<userData>/logs/backend.log`, appended. The file is created
  with mode 0600 because the backend prints its API key to stdout at startup.
- `userData` is Electron's default directory for the app. `main.ts` overrides it only through
  `LABRYNTH_USER_DATA`. On Linux, Electron's convention is `~/.config/Labrynth`; this path was
  not checked on a running install.
- HTTP request logs are **not** in `backend.log`. They are in the backend's NDJSON run log
  under `~/REACHER/LOG/runs/`.
- The shell's own `[labrynth]` messages go to the Electron process's stdout, not to
  `backend.log`.

## Development

Requirements: Node 22.12 or newer (Electron 44; CI pins Node 22), a Python interpreter with
`reacher` importable, and `web/dist` built.

```bash
cd web && npm ci && npm run build      # web/dist, served by the backend
cd ../desktop
npm ci                                 # downloads the Electron binary
npm start                              # tsc build, then electron .
```

To choose the backend interpreter: `LABRYNTH_PYTHON=/path/to/python npm start`. Without it,
`<repo>/.venv/bin/python` is used if it exists, otherwise `python3`.

Typecheck only (what the CI `desktop` job runs): `npx tsc -p . --noEmit`.

## Packaging

```bash
python build.py                  # GUI bundle, dist/Labrynth/ (must exist first)
python build.py --desktop        # npm ci, npm run build, electron-builder --linux
```

Output goes to `dist/desktop/`:

- `labrynth_<version>_amd64.deb`
- `labrynth-<version>-linux-x64.AppImage`
- `linux-unpacked/` (the `dir` target, for local runs)

Keep these names. The in-app updater in `reacher` (`routers/update.py`) matches assets by
suffix (`_amd64.deb`, `-linux-x64.AppImage`).

- `--desktop` on a non-Linux host prints a skip message and does nothing.
- `--desktop` cannot be combined with `--cli-only`.
- The `.deb` is built by fpm, which needs `libcrypt.so.1`. It builds on Debian and Ubuntu (CI
  uses `ubuntu-24.04`). It does not build on hosts without libxcrypt-compat, such as Arch.
- The packaged app layout is set in `desktop/electron-builder.yml`: the backend bundle goes to
  `resources/backend/`, and the icon to `resources/icon.png`.

## Smoke test

```bash
xvfb-run -a scripts/desktop-smoke.sh dist/desktop/linux-unpacked/labrynth [port]
```

Default port is 6329. The script never uses 6229. CI supplies a display with `xvfb-run`. To run
it locally, use a desktop session instead; the script omits `--ozone-platform=headless`, which
segfaults on these hosts.

What it does:

- Uses an isolated `HOME` and `LABRYNTH_USER_DATA` in a temporary directory.
- Refuses to run (exit 2) if something already listens on the port.
- Launches Electron with `--no-sandbox`. CI runners and AppImages cannot use the setuid
  `chrome-sandbox`. The app itself never passes this flag.
- Waits up to 60 s for `/health` to report `service: "reacher"`.
- Sends SIGTERM to Electron.

It passes only if `/health` answered, Electron exited within 20 s, the port is free within
15 s, and the backend process is gone. A missing token request in the NDJSON run log is a
warning, not a failure. The last line is `DESKTOP SMOKE PASS` or
`DESKTOP SMOKE FAIL: <reason>`.

## Known limitations

- **Linux only.** Windows packaging is not done. A Windows build needs a reacher-side
  graceful-shutdown path, because SIGINT does not exist for a child process on Windows.
  macOS needs one-dir output nested in the Electron bundle and signing.
- **No code signing.** Builds are unsigned, so the OS will show its unsigned-software warnings.
- **Browser presets and paired machines do not carry over.** Presets and the paired-machine
  list live in browser localStorage. The desktop app has its own storage, so these must be
  set up again in the desktop app.
- **Ubuntu 24.04 sandbox.** Ubuntu 23.10 and later restrict unprivileged user namespaces with
  AppArmor, a known cause of Electron sandbox failures. Not yet checked on an Ubuntu 24.04
  lab machine.
- **Updater and single-instance lock.** An AppImage self-update can start the new instance
  before the old one has released the single-instance lock. Not addressed in this phase.
- The browser fallback is unchanged from the browser build.
