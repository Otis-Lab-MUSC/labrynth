# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> Labrynth uses development versioning (`-dev` suffix) between releases. Entries here are grouped by minor-version series.

---

## [Unreleased]

---

## [2.4.1-dev] - 2026-06-09

### Added
- Per-device lever routing in output device cards: each CUE and PUMP card independently exposes a compact **Any / RH / LH** toggle ("Trigger on") in its contingency section; selecting RH or LH sends the new firmware filter commands (378/388/478/488) alongside the appropriate `LEVER_SET_ACTIVE` pair (1081/1080, 1381/1380) for ratio counting; conflict indicator (⚠) shown when armed output devices have different non-"any" filters, since current firmware routes all filter commands to `Trigger[0]`
- `ContingencyConfig.leverFilter: "none" | "rh" | "lh"` — replaces the boolean `rhLever / lhLever / lickCircuit` fields with a single discriminated selector; `delay` field retained (UI-only, pending firmware command)
- `leverFilter` param wired into `PRESET_COMMAND_MAP` for all four output devices (command codes 378/388/478/488); both `ProgramPanel` preset-apply paths convert the string value to its firmware numeric before sending (0/1/2)
- `ContingencySection` "Trigger on" toggle hidden entirely when `paradigm === "pavlovian"` (Pavlovian has no lever-based reward routing)

### Changed
- `ContingencyConfig` simplified from `{ rhLever, lhLever, lickCircuit: boolean; delay }` to `{ leverFilter: "none" | "rh" | "lh"; delay }` — cascades through `types/index.ts`, store defaults, preset data, and component state
- `HardwareUiState.activeLever` field removed; per-device `leverFilter` on each output device replaces the global active-lever concept; `Omit` references in `presets/types.ts` and `presets/deviceMetadata.ts` updated accordingly
- Lick Circuit removed from the "Contingent on" section of output device cards; `LickCircuitControl` Arm/Disarm handlers no longer mirror state into output device contingency configs
- SA High/Mid/Low presets updated to new contingency format: `{ leverFilter: "rh", delay: 0 }` for `primaryCue` and `primaryPump`; `"none"` for inactive/optional output devices
- SA Extinction and Pavlovian Acquisition/Reversal presets updated to `{ leverFilter: "none", delay: 0 }` across all cue/pump entries
- Preset popup device labels updated to match current naming convention: "Primary Cue" → **CUE 1**, "Secondary Cue" → **CUE 2**, "Primary Pump" → **PUMP 1**, "Secondary Pump" → **PUMP 2** in all built-in preset device lists and `deviceMetadata.ts`
- Hardware Controls sections separated by horizontal dividers with 24 px clearance (`divide-y divide-theme-text/10`, `pt-6`) for visual breathing room between Input Devices / Output Devices / Two-Photon Devices groups

---

## [2.3.5-dev] - 2026-06-08

### Added
- `ContingencyConfig` type (`{ rhLever, lhLever, lickCircuit: boolean; delay: number }`) embedded in `CueUiState` and `PumpUiState`; `activeLever: "rh" | "lh" | null` added to `HardwareUiState` as global source of truth for which lever is firmware-active
- `ContingencySection` component: "Contingent on" multi-checkbox area (RH Lever, LH Lever, Lick Circuit) + onset delay field rendered under each CUE and PUMP output device card; lever checkboxes mirror across all four output devices to reflect firmware's global active-lever semantics; delay field is UI-stored pending firmware command support
- Laser `RH Only` mode button (command 684) with onset delay input (command 673, 0–60000 ms) in `LaserControl` for non-Pavlovian paradigms
- `rh_lever: 684` entry in `LASER_MODE_COMMANDS` map; `ProgramPanel` preset-apply paths exclude `rh_lever` from Pavlovian trial-paired preamble

### Changed
- Hardware Controls layout restructured into three labeled sections: **Input Devices** (RH Lever → LH Lever → Lick Circuit), **Output Devices** (CUE 1 → CUE 2 → PUMP 1 → PUMP 2 → Laser), **Two-Photon Devices** (Microscope + SLM); numeric device ordering corrected (CUE 1 now left of CUE 2, PUMP 1 left of PUMP 2)
- Lever cards no longer show Active/Inactive toggle buttons; active/inactive lever state is now set by checking the RH Lever or LH Lever checkbox on any output device's Contingent-on section
- `LickCircuitControl` Arm/Disarm now mirrors `lickCircuit.armed` state into all four output device contingency configs for bidirectional sync
- `SA Extinction` preset: Primary Cue and Primary Pump demoted from `required: true` to `required: false` in the device list; only levers are required for extinction
- SA High/Mid/Low presets: `primaryCue` and `primaryPump` hardware defaults now include `contingency: { rhLever: true, ... }` reflecting canonical SA contingency (RH lever drives outputs)
- Pavlovian presets: cue and pump hardware entries include null contingency defaults (`rhLever: false, lhLever: false`)
- `useSessionRecovery` hardcoded `hardwareUi` object replaced with `defaultHardwareUiState()` call

---

## [2.3.4-dev] - 2026-06-03

### Changed
- Hardware grid split into "Behavior Devices" and "Two-Photon Imaging" sections; Microscope and SLM moved under a labeled subsection for visual differentiation from operant behavior devices
- SLM advisory ("Microscope not armed") removed from `SLMControl` — no other device has an equivalent cross-device warning
- SLM added to all built-in presets (SA High/Mid/Low/Extinction, Pavlovian Acquisition/Reversal) as an optional disarmed device at default pin 11

---

## [2.3.3-dev] - 2026-06-03

### Changed
- SLM promoted from plugin system to first-class native hardware control: `SLMControl` component added to Configuration hardware grid alongside Lick Circuit and Microscope; firmware config sync wired via `DEVICE_TO_UI_KEY`; `PRESET_COMMAND_MAP` updated with SLM arm/disarm codes (1101/1100)
- Plugin infrastructure removed: `PluginManager`, `PluginCard`, `usePluginStore`, plugin manifest (`slm-timestamps.json`), and plugin registry deleted — SLM was the sole plugin

---

## [2.3.1-dev] - 2026-06-02

### Added
- SLM (Spatial Light Modulator) plugin system: manifest-based `PluginManifest` type, bundled `PLUGIN_REGISTRY`, `usePluginStore` Zustand store (localStorage-persisted) with install/uninstall actions
- `PluginManager` and `PluginCard` components in Hardware panel for installing optional device plugins
- SLM plugin manifest (`slm-timestamps.json`): arm/disarm/pin commands (1100/1101/1176), PCINT0 pin constraint (pins 8–13), magenta visualization color
- `EventTimeline` SLM swimlane (magenta `#ff00ff` dark / purple `#9333ea` light) with instantaneous-tick rendering via existing behavioral-event path
- `SlmUiState` type (`{ armed: boolean; pin: number }`) added to `HardwareUiState`; `slmData: number[]` added to `Session`
- `getSlmEvents(sessionId)` API client method calling `GET /api/data/{id}/slm`
- SLM component in `pinMeta.ts` (code 1176, default pin 11, PCINT0 group, no PWM requirement); `validPinsFor()` respects `COMPONENT_REQUIRES_PCINT`

---

## [2.2.19-dev] - 2026-06-02

### Fixed
- Update version detection: switch from `/releases/latest` (returns most recently *published* release, not highest semantic version) to `/releases?per_page=10` and reduce by semantic version; fixes false-negative update checks when CI releases are published out of order
- Installer download: `httpx` streaming call now follows redirects (`follow_redirects=True`) — GitHub release asset URLs return a 302 to the CDN; without this the download failed immediately with `302: Failed to download asset` (requires reacher develop)

---

## [2.2.18-dev] - 2026-06-02

### Fixed
- Linux installer download: backend asset suffix patterns corrected to match CI-produced filenames (`_amd64.deb`, `-linux-x64.tar.gz`, `-linux-x64.AppImage`); previous patterns never matched any release asset, causing "No download link available for this platform" on all Linux installs (requires reacher develop)

---

## [2.2.18-test] - 2026-06-02

### Changed
- Smoke-test release to verify in-app updater end-to-end (no functional changes)

---

## [2.2.17-dev] - 2026-06-02

### Added
- In-app installer download and launch: update banner and About modal now offer a "Download" button that streams the platform-specific installer (`.exe` / `.dmg` / `.deb` / `.AppImage`) from GitHub releases, shows download progress as a percentage bar, then launches the installer via the OS and triggers a graceful backend shutdown
- New backend endpoints: `GET /api/update/info`, `POST /api/update/download`, `GET /api/update/status`, `POST /api/update/launch` (added to `reacher` develop)
- `startDownload` / `launchInstaller` actions added to `useUpdateStore`; download state machine drives `UpdateBanner` through idle → downloading → ready → launching → error states

---

## [2.2.15-dev] - 2026-06-02

### Added
- In-app version update notifications: dismissible `UpdateBanner` and `AboutModal` with Labrynth + backend version info, linking to GitHub release notes (closes #10)
- `useUpdateStore` Zustand singleton for update-check polling (4-hour interval, app-lifecycle scoped)

### Fixed
- Version source: update check now compares Labrynth's own `__APP_VERSION__` against the latest GitHub release, not the reacher backend version
- Infinite re-render regression caused by missing `useShallow` in `useUpdateCheck` selector (Zustand v5 `useSyncExternalStore` pattern)

---

## [2.2.14-dev] - 2026-06-01

### Changed
- Config review panel annotation updated to reflect rule-based validation — UI label, comments, and inline annotations that previously referenced "AI" or "Ollama" have been corrected (requires reacher develop)

---

## [2.2.13-dev] - 2026-06-01

### Added
- Config review panel in Session Start Modal: calls the backend `/api/validate/config` endpoint before `start_program()` and surfaces structured warnings with severity badges; researcher can dismiss or acknowledge and proceed
- `ValidationWarningPanel` component for displaying config validation warnings inline inside the modal

### Fixed
- Session Start Modal shows a "config validator unavailable" indicator when the validation endpoint cannot be reached, distinguishing a clean result from a skipped check

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
