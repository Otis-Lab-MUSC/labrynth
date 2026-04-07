import type { TutorialStep } from "../../../store/useTutorialStore";
import type { Session } from "../../../types";

function formatParadigmSummary(session: Session): string | null {
  if (!session.paradigmSettings || !session.paradigm) return null;
  const s = session.paradigmSettings;
  const p = session.paradigm.toLowerCase();
  const parts: string[] = [];

  if (p.includes("fr") || p.includes("fixed")) {
    if (s.ratio > 0) parts.push(`Ratio: ${s.ratio}`);
  } else if (p.includes("pr") || p.includes("progressive")) {
    if (s.ratio > 0) parts.push(`Starting ratio: ${s.ratio}`);
    if (s.step > 0) parts.push(`Step: ${s.step}`);
  } else if (p.includes("vi") || p.includes("variable")) {
    if (s.interval > 0) parts.push(`Interval: ${s.interval}s`);
  } else if (p.includes("omission") || p.includes("pavlov")) {
    if (s.traceInterval > 0) parts.push(`Trace interval: ${s.traceInterval}s`);
  }

  if (parts.length === 0) return null;
  return `Paradigm: ${session.paradigm}\n${parts.join("\n")}`;
}

function formatLimitSummary(session: Session): string | null {
  if (!session.limitSettings) return null;
  const l = session.limitSettings;
  const parts: string[] = [`Type: ${l.limitType}`];
  if (l.timeLimit > 0) parts.push(`Time: ${l.timeLimit}s`);
  if (l.infusionLimit > 0) parts.push(`Infusions: ${l.infusionLimit}`);
  if (l.delay > 0) parts.push(`Delay: ${l.delay}s`);
  return parts.length > 1 ? parts.join("\n") : null;
}

function formatFileSummary(session: Session): string | null {
  const f = session.fileConfig;
  if (!f.filename && !f.destination) return null;
  const parts: string[] = [];
  if (f.filename) parts.push(`File: ${f.filename}`);
  if (f.destination) parts.push(`Dest: ${f.destination}`);
  return parts.join("\n");
}

function formatCompleteSummary(session: Session): string | null {
  const parts: string[] = [];
  if (session.port) parts.push(`Port: ${session.port}`);
  if (session.paradigm) parts.push(`Paradigm: ${session.paradigm}`);
  if (session.limitSettings) parts.push(`Limits: ${session.limitSettings.limitType}`);

  const armed: string[] = [];
  if (session.hardwareUi.rhLever.armed) armed.push("RH Lever");
  if (session.hardwareUi.lhLever.armed) armed.push("LH Lever");
  if (session.hardwareUi.primaryCue.armed) armed.push("Primary Cue");
  if (session.hardwareUi.primaryPump.armed) armed.push("Primary Pump");
  if (armed.length > 0) parts.push(`Armed: ${armed.join(", ")}`);

  return parts.length > 0 ? parts.join("\n") : null;
}

export function firstSessionTour(): TutorialStep[] {
  return [
    // ── Getting Started ──────────────────────────────────
    {
      id: "first-session-1",
      panel: null,
      target: "header",
      title: "Welcome to Labrynth",
      content:
        "This is the control interface for REACHER experiments. We'll walk through each panel and let you configure a session as you go.",
      placement: "bottom",
      section: "Getting Started",
    },
    {
      id: "first-session-2",
      panel: "session",
      target: "sidebar",
      title: "Navigation",
      content:
        "Use the sidebar to switch between panels: Session, Configuration, Monitor, and Data. Each handles a different part of the experiment workflow.",
      placement: "right",
      section: "Getting Started",
    },
    {
      id: "first-session-3",
      panel: "session",
      target: "new-session",
      title: "Creating a Session",
      content:
        "Try clicking the + button to create a new session tab. You can run multiple sessions simultaneously, each connected to a different Arduino.",
      placement: "bottom",
      interactive: true,
      section: "Getting Started",
    },

    {
      id: "first-session-3b",
      panel: "session",
      target: "machine-management",
      title: "Device Management",
      content:
        "Expand this section to pair remote REACHER devices on your network. You can enter a 6-digit pairing code, scan for discovered devices, or add a machine manually by URL.",
      placement: "bottom",
      section: "Getting Started",
    },

    // ── Connection ───────────────────────────────────────
    {
      id: "first-session-4",
      panel: "session",
      target: "port-select",
      title: "Connecting to Hardware",
      content:
        "Select your Arduino's COM port from the dropdown, then click CONNECT. The system will auto-detect the board type (UNO or Mega) and paradigm from the loaded firmware.",
      placement: "bottom",
      interactive: true,
      section: "Connection",
      gate: (s) => s !== null && s.state !== "idle" && !s.draft,
    },
    {
      id: "first-session-4b",
      panel: "session",
      target: "active-session",
      title: "Active Session",
      content:
        "Once connected, the Active Session card shows the detected board type, paradigm, and current state. You can also set a human-readable session name here — it appears in logs and exported data.",
      placement: "bottom",
      section: "Connection",
    },
    {
      id: "first-session-5",
      panel: "session",
      target: "firmware-card",
      title: "Firmware Upload",
      content:
        "If you need to change paradigms, use this card to upload different firmware. Try selecting a paradigm and board type.",
      placement: "bottom",
      interactive: true,
      section: "Connection",
    },

    // ── Configuration ───────────────────────────────────────
    {
      id: "first-session-6",
      panel: "configuration",
      target: "preset-select",
      title: "Session Presets",
      content:
        "Try selecting a preset to auto-fill hardware settings, paradigm parameters, and limits in one click.",
      placement: "bottom",
      interactive: true,
      section: "Configuration",
    },
    {
      id: "first-session-6b",
      panel: "configuration",
      target: "preset-card",
      title: "Preset Details",
      content:
        "The preset card shows session limits, the device table with arm/disarm toggles for each piece of hardware, and the configured parameters. Review and adjust, then click Apply Preset to push all settings to the session at once.",
      placement: "bottom",
      interactive: true,
      section: "Configuration",
    },
    {
      id: "first-session-7",
      panel: "configuration",
      target: "paradigm-settings",
      title: "Paradigm Settings",
      content:
        "Configure paradigm-specific parameters here. Try adjusting the values — they'll be sent to the Arduino when you start.",
      placement: "bottom",
      interactive: true,
      section: "Configuration",
      summary: formatParadigmSummary,
    },
    {
      id: "first-session-8",
      panel: "configuration",
      target: "limit-config",
      title: "Session Limits",
      content:
        "Set how the session ends: by time, infusion count, trial count, or a combination. Try configuring a limit now.",
      placement: "bottom",
      interactive: true,
      section: "Configuration",
      summary: formatLimitSummary,
    },
    {
      id: "first-session-9",
      panel: "configuration",
      target: "start-session",
      title: "Starting a Session",
      content:
        "When everything is configured, click Start Session. A review modal will let you verify all settings before the experiment begins.",
      placement: "top",
      section: "Configuration",
    },

    // ── Configuration: Hardware ────────────────────────────
    {
      id: "first-session-10",
      panel: "configuration",
      target: "system-controls",
      title: "System Controls",
      content:
        "Test Chain triggers a full device check. Try toggling Test Mode to manually activate devices without running a program.",
      placement: "bottom",
      interactive: true,
      section: "Configuration",
    },
    {
      id: "first-session-11",
      panel: "configuration",
      target: "lever-card",
      title: "Arming Devices",
      content:
        "Each device must be armed before a session to participate. Arming sends the activation command to the Arduino — the device enters the control loop and will respond to program events. Disarming removes it cleanly. Only arm the devices your paradigm requires; unneeded hardware can stay disarmed.",
      placement: "bottom",
      section: "Configuration",
    },

    // ── Monitor ──────────────────────────────────────────
    {
      id: "first-session-14",
      panel: "monitor",
      target: "monitor-heading",
      title: "Monitor Panel",
      content:
        "The Monitor panel shows real-time experiment data. The running indicator shows whether the session is active, paused, or waiting.",
      placement: "bottom",
      section: "Monitor",
    },
    {
      id: "first-session-15",
      panel: "monitor",
      target: "experiment-controls",
      title: "Start / Stop / Pause",
      content:
        "Control the running experiment: Start begins the program, Stop ends it, and Pause freezes the timer and event processing.",
      placement: "bottom",
      section: "Monitor",
    },
    {
      id: "first-session-15b",
      panel: "monitor",
      target: "split-button",
      title: "Session Segmentation",
      content:
        "Click Split to mark a segment boundary during a running session. Use this to separate experimental phases (baseline, drug, recovery) within a single recording.",
      placement: "bottom",
      section: "Monitor",
    },
    {
      id: "first-session-16",
      panel: "monitor",
      target: "live-stats",
      title: "Live Statistics",
      content:
        "Track elapsed time, lever presses, infusion count, and trial count as the experiment runs.",
      placement: "bottom",
      section: "Monitor",
    },

    // ── Data ─────────────────────────────────────────────
    {
      id: "first-session-17",
      panel: "data",
      target: "file-config",
      title: "File Configuration",
      content:
        "Set a filename and destination folder for your exported data. If left blank, the system defaults to a timestamp-based filename saved to your machine's Downloads folder. " +
        "Separately, the Python engine appends every behavioral event to an on-disk log (~/REACHER/LOG/) in real time — fsynced per-event — so your data is safe even if the export step is skipped or the session crashes.",
      placement: "bottom",
      interactive: true,
      section: "Data",
      summary: formatFileSummary,
    },
    {
      id: "first-session-18",
      panel: "data",
      target: "export-card",
      title: "Data Export",
      content:
        "After the session ends, click Export ZIP to save all recorded data including behavior events, frame timestamps, and a session summary.",
      placement: "bottom",
      section: "Data",
    },

    // ── Complete ─────────────────────────────────────────
    {
      id: "first-session-19",
      panel: null,
      target: "terminal-bar",
      title: "Terminal",
      content:
        "The terminal shows log messages: connection events, errors, upload progress, and session state changes. Click to expand.",
      placement: "top",
      section: "Complete",
    },
    {
      id: "first-session-20",
      panel: null,
      target: "",
      title: "Tour Complete",
      content:
        import.meta.env.VITE_DEMO_SITE === "true"
          ? "You're all set! Reopen this tour anytime from the Help panel (? icon). Feel free to explore — all interactions use simulated data."
          : "You're all set! Reopen this tour from the Help panel (? icon), or try Demo Mode to explore without hardware connected.",
      placement: "center",
      section: "Complete",
      summary: formatCompleteSummary,
    },
  ];
}
