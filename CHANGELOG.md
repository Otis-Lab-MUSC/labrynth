# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> Labrynth uses development versioning (`-dev` suffix) between releases. Entries here are grouped by minor-version series.

---

## [Unreleased]

### Added
- AI config review panel in Session Start Modal: calls the backend `/api/validate/config` endpoint (Ollama-powered) before `start_program()` and surfaces structured warnings with severity badges; researcher can dismiss or acknowledge and proceed
- `ValidationWarningPanel` component for displaying AI validation warnings inline inside the modal

### Fixed
- Session Start Modal now shows a "config validator unavailable" indicator in the action bar when Ollama is unreachable, distinguishing a clean validation result from a skipped check

---

## [2.2.9-dev] - 2026-05-29

### Added
- Elapsed time display (start time + running elapsed clock) anchored below the animated mouse indicator in the Session monitor header

### Changed
- Connect/Disconnect merged into a single toggle button in the COM Port card (was two separate buttons)
- Session name field promoted to first item in the Active Session card
- "Manage Devices" collapse now uses ChevronDown/Right icons, consistent with Hardware Controls
- Hardware renamed to numerical convention: CUE 1/CUE 2, PUMP 1/PUMP 2 (was Primary/Secondary)
- Session confirmation modal limits and name are now read-only; configure limits in Session Configuration before starting
- Paradigm flow diagram minimum bar width reduced for more accurate proportions; hover tooltips show exact event duration in ms
- Firmware upload progress replaced with `Loader2` spinner + cycling stage text

### Removed
- ELAPSED and TOTAL ELAPSED removed from stats grid; timing now shown in monitor header under the mouse indicator

---

## [2.2.0-dev] - 2026-05-27

### Added
- Watchdog: graceful server suspend with configurable idle timeout (5 min) and shutdown timeout (60 min)
- Idle timer overlay showing countdown to suspend/shutdown; displayed over UI when idle
- Contextual help hints throughout UI panels (Configuration, Hardware, Program); inline placeholders replace `HintIcon` component
- `GET /browse` endpoint with native folder picker dialog (zenity on Linux, tkinter fallback)

### Changed
- Data panel collapsed by default; session data auto-exports on session end
- Sidebar widened; button styles standardized; export alert anchored near controls

### Fixed
- Watchdog no longer triggers shutdown before serial communication is established; idle timeout corrected to 5 min / 60 min
- `isRemoteSession` null guard ordering corrected to satisfy strict-null check
- Browser double-download suppressed for local sessions; destination placeholder text corrected
- PyInstaller bundle now includes `pyserial` hidden imports so packaged app detects serial ports on first launch
- Lever commands skipped for Pavlovian paradigm sessions (no active levers)
- Firmware submodule staleness gate added to CI release workflow

---

## [2.1.0] - 2026-04-07

### Added
- Per-session Arduino pin override UI for all hardware controls (cue, pump, lick, laser, microscope, levers)
- Pump selection toggle in paradigm settings for dual-pump setups
- Save-as-preset to persist researcher hardware and program configurations; edit and delete actions on custom preset cards
- Real-time session progress bars in Monitor view
- Split, Restart, and Play (Resume) controls for session segmentation in Monitor
- Pavlovian trial counter split into CS+ and CS− in Monitor stats
- `--incognito` flag for private browser launch
- macOS x64 builds, Linux AppImage, and version gate in CI distribution pipeline
- Windows `.exe` installer (Inno Setup), macOS `.dmg`, Linux `.deb` + `.tar.gz` built on `v*.*.*` tags
- Monitor tab icon animated while session is running

### Changed
- Program and Hardware pages merged into unified Configuration page; tutorial and web demo realigned
- Distribution artifacts rebranded from REACHER to Labrynth
- `/usr/local/bin` symlink renamed from `reacher` to `labrynth`

### Fixed
- Laser Pavlovian phase command codes corrected (codes were swapped)
- Laser frontend defaults aligned to firmware; phase restored on session recovery
- Trial-Paired laser defaults to CS_BOTH; frequency quantization tooltip added
- Lever stats hidden in Monitor when no levers are armed
- Stop confirmation replaced `window.confirm` with dialog component
- Real package version shown in footer and welcome splash (was hardcoded)
- Auto-restore of paired machines lost from `localStorage`
- avrdude binary detection: auto-downloads when shim or missing; Chocolatey shim resolved to real binary path
- Host-offline state surfaced in UI; proxy event loss resolved for remote sessions
- Monitor stats spacing tightened; elapsed time resets on segment split
- Preset commands sent at session start time; SA Mid, SA Low, SA Extinction presets include optional devices
- Export archive suffix stripped in `sanitizeFilename`
- LH lever rendered in left column, RH lever in right column in hardware grid
- Start Session and Save Preset buttons repositioned in Configuration panel

---

## [2.0.0] - 2026-03-27

_Changelog tracking started at this version. Earlier history not recorded._

### Added
- Initial Labrynth release as application shell for the REACHER ecosystem
- React 19 + TypeScript frontend with Vite and Tailwind CSS; five named themes (`reacher`, `terminal`, `neural`, `midnight`, `ember`)
- Terminal CLI (`cli/`) using prompt_toolkit: MENU, INPUT, SELECT, and MONITOR modes with live WebSocket feed
- PyInstaller build pipeline (`build.py`) with 5-stage orchestration (validate → firmware → frontend → verify → bundle)
- Multi-machine support: local and remote REACHER hosts with proxy mode; mDNS discovery via `useMachineStore`
- Five self-administration presets (SA High, SA Mid, SA Low, SA Extinction, Pavlovian)
- Web demo mode with mock API client for static hosting
- CI/CD pipeline: installer builds on `v*.*.*` tags; demo site deploy workflow
- `useSingleTab` hook enforces single-tab usage (other tabs see a blocked screen)
