# Labrynth — React Frontend

**Browser-based experiment control interface for the REACHER ecosystem**

[![Version](https://img.shields.io/badge/version-3.0.0--beta.5-blue)](https://github.com/Otis-Lab-MUSC/labrynth)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Phoxel Workbench](https://img.shields.io/badge/Phoxel_Workbench-member-orange)](https://github.com/Otis-Lab-MUSC)

*Written by*: Joshua Boquiren

[![](https://img.shields.io/badge/@thejoshbq-grey?style=flat&logo=github)](https://github.com/thejoshbq)

---

## Overview

The Labrynth frontend is a React 19 + TypeScript single-page application providing the browser-based user interface for REACHER experiments. It enables researchers to manage sessions, configure hardware devices, run behavioral paradigms, monitor events in real time, and export data — all from a web browser.

In production, these static files are served by the Python backend and bundled into the standalone executable. During development, the Vite dev server runs independently with hot module replacement and proxies API requests to the backend.

---

## Role in the REACHER Ecosystem

The frontend is the user-facing layer of the Labrynth application shell:

```
Arduino Firmware ◄──► Python Backend ◄──REST API + WebSocket──► React Frontend (web/)
   (firmware/)          (server/)                                   browser UI
```

It communicates with the Python backend via:
- **REST API** (`/api/*`) — session CRUD, hardware commands, program control, data export
- **WebSocket** (`/ws/{session_id}`) — real-time event streaming (behavioral events, frame timestamps, firmware upload progress, session state changes)

---

## Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | ~5.7 | Type-safe JavaScript |
| Vite | 6 | Build tool and dev server |
| Tailwind CSS | 3.4 | Utility-first CSS framework |
| Zustand | 5 | Lightweight state management |
| Lucide React | 0.468+ | Icon library |
| ESLint | 9 | Code linting |
| PostCSS + Autoprefixer | Latest | CSS processing |

---

## Architecture

### Component Breakdown

```
src/
├── api/
│   ├── client.ts                  # HTTP client with typed endpoint functions
│   └── websocket.ts               # ReacherWebSocket class (auto-reconnect)
├── components/
│   ├── data/
│   │   └── DataExport.tsx         # File config, CSV export, data preview table
│   ├── hardware/
│   │   ├── HardwarePanel.tsx      # Main hardware controls (test chain, test mode)
│   │   ├── LeverControl.tsx       # RH/LH lever arm, ratio, timeout, active/inactive
│   │   ├── CueControl.tsx         # Primary/secondary cue arm, frequency, duration
│   │   ├── PumpControl.tsx        # Primary/secondary pump arm, duration
│   │   ├── LaserControl.tsx       # Laser arm, frequency, duration, contingent/independent
│   │   ├── LickCircuitControl.tsx # Lick detector arm/disarm
│   │   └── MicroscopeControl.tsx  # Microscope arm, trigger test
│   ├── layout/
│   │   ├── Header.tsx             # Session tabs, theme toggle, session creation
│   │   └── Sidebar.tsx            # Navigation menu (5 panels)
│   ├── monitor/
│   │   ├── MonitorPanel.tsx       # Start/stop/pause controls, elapsed time
│   │   ├── LiveCounters.tsx       # Real-time counters (trials, infusions, presses, licks, frames)
│   │   └── EventTimeline.tsx      # SVG timeline visualization with device lanes
│   ├── program/
│   │   ├── ProgramPanel.tsx       # Routes to paradigm-specific settings
│   │   ├── ParadigmSettings.tsx   # FR/PR/VI/Omission parameter configuration
│   │   ├── PavlovianSettings.tsx  # Pavlovian CS+/CS-/ITI parameter configuration
│   │   └── LimitConfig.tsx        # Time, infusion, and trial limit settings
│   └── session/
│       ├── SessionPanel.tsx       # Port selection, session creation, connection
│       └── FirmwareUploadCard.tsx # Paradigm selection, upload progress bar
├── hooks/
│   ├── useWebSocket.ts            # WebSocket connection and message routing
│   ├── useBeforeUnload.ts         # Sends shutdown beacon on page close
│   ├── useFirmwareUpload.ts       # Firmware upload state and API call
│   └── useContainerWidth.ts       # ResizeObserver for responsive layouts
├── store/
│   ├── useSessionStore.ts         # Zustand store: sessions, events, counters
│   └── useThemeStore.ts           # Zustand store: dark/light theme (persisted)
├── types/
│   └── index.ts                   # TypeScript interfaces (Session, BehaviorEvent, etc.)
├── App.tsx                        # Main app: panel routing, hook initialization
├── main.tsx                       # React DOM entry point
└── index.css                      # Global styles, Tailwind layers, custom theme
```

### State Management

**Session Store** (`useSessionStore`) — manages all experiment state:
- Active sessions with port, paradigm, state, firmware info
- Behavioral event data and frame timestamps
- Live counters (infusions, presses, trials, licks)
- Upload progress tracking
- Pavlovian parameter storage

Session states: `idle` → `uploading` → `connected` → `running` → `paused` → `stopped`

**Theme Store** (`useThemeStore`) — dark/light mode:
- Persisted to `localStorage` (`labrynth-mode` / `labrynth-theme-id` keys)
- Defaults to dark mode (optimized for lab environments)
- Class-based toggling on `<html>` element

### Custom Hooks

| Hook | Purpose |
|---|---|
| `useWebSocket` | Connects to `/ws/{sessionId}`, routes messages (event, frame, config, upload_progress, session_state), auto-reconnects after 2s |
| `useBeforeUnload` | Sends `/api/lifecycle/shutdown` beacon on page unload/visibility change |
| `useFirmwareUpload` | Manages firmware upload state (uploading, error) and API call |
| `useContainerWidth` | Tracks element width via ResizeObserver for responsive SVG rendering |

### API Client

The HTTP client (`api/client.ts`) provides typed functions for all backend endpoints:

- **Sessions** — create, list, get, destroy, reset
- **Serial** — list ports, connect, disconnect
- **Firmware** — list paradigms, upload
- **Hardware** — send command, list commands, get config
- **Program** — start, stop, pause, set limits
- **Data** — get behavior events (with `since` pagination), get frames, export CSV
- **File** — set filename/destination
- **Lifecycle** — shutdown

The WebSocket client (`api/websocket.ts`) auto-detects protocol (`ws://` or `wss://`), reconnects after 2 seconds on disconnection, and handles page unload gracefully.

### Event Timeline

The `EventTimeline` component renders an SVG-based real-time visualization with:
- Device lanes (RH Lever, LH Lever, Cue, Pump, Lick, Laser, Controller)
- Color-coded events with press type differentiation (active, timeout, inactive)
- Dynamic time axis with adaptive tick intervals
- Interactive tooltips showing device, event, timestamps, and duration
- Responsive width via ResizeObserver

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ |
| npm | (bundled with Node.js) |

---

## Development

### Install dependencies

```bash
npm install
```

### Start development server

```bash
npm run dev
```

The Vite dev server starts on `http://localhost:5173` with hot module replacement. API requests (`/api/*`) and WebSocket connections (`/ws/*`) are proxied to the Python backend on `http://localhost:6229`.

> **Note:** The Python backend must be running separately for the UI to function. See the [top-level README](../README.md) for development setup instructions.

### Lint

```bash
npm run lint
```

---

## Building for Production

```bash
npm run build
```

This compiles TypeScript and builds optimized static files into the `dist/` directory. These files are:
- Served by the Python backend as static files at the root URL
- Bundled into the standalone executable by PyInstaller during the full build process

To preview the production build locally:

```bash
npm run preview
```

---

## How It Connects to the Backend

| Channel | URL | Purpose |
|---|---|---|
| REST API | `http://localhost:6229/api/*` | Session management, hardware commands, data retrieval |
| WebSocket | `ws://localhost:6229/ws/{session_id}` | Real-time event streaming |
| Firmware upload | `POST /api/firmware/upload/{id}` | Triggers backend to flash Arduino via avrdude |

In development, Vite proxies these requests from port 5173 to port 6229. In production, the backend serves both the API and the frontend static files on the same port.

---

## Design System

The UI uses a terminal-inspired aesthetic optimized for lab environments:

- **Dark mode** (default) — black background with neon green accents (`#00FF41`)
- **Light mode** — white background with green accents (`#16A34A`)
- **Font** — JetBrains Mono (monospace)
- **Class-based dark mode** — Tailwind `dark:` variants via `.dark` class on `<html>`

---

## License

This project is licensed under the MIT License.

## Contact

Joshua Boquiren — [thejoshbq@proton.me](mailto:thejoshbq@proton.me)

[GitHub: Otis-Lab-MUSC/labrynth](https://github.com/Otis-Lab-MUSC/labrynth)
