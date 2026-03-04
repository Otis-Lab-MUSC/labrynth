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

function formatLeverSummary(session: Session): string | null {
  const rh = session.hardwareUi.rhLever;
  const lh = session.hardwareUi.lhLever;
  const parts: string[] = [];
  if (rh.armed) parts.push(`RH Lever: armed (timeout ${rh.timeout}ms, ratio ${rh.ratio})`);
  if (lh.armed) parts.push(`LH Lever: armed (timeout ${lh.timeout}ms, ratio ${lh.ratio})`);
  return parts.length > 0 ? parts.join("\n") : null;
}

function formatCueSummary(session: Session): string | null {
  const pc = session.hardwareUi.primaryCue;
  const sc = session.hardwareUi.secondaryCue;
  const parts: string[] = [];
  if (pc.armed) parts.push(`Primary: ${pc.frequency}Hz, ${pc.duration}ms`);
  if (sc.armed) parts.push(`Secondary: ${sc.frequency}Hz, ${sc.duration}ms`);
  return parts.length > 0 ? parts.join("\n") : null;
}

function formatPumpSummary(session: Session): string | null {
  const pp = session.hardwareUi.primaryPump;
  const sp = session.hardwareUi.secondaryPump;
  const parts: string[] = [];
  if (pp.armed) parts.push(`Primary: ${pp.duration}ms`);
  if (sp.armed) parts.push(`Secondary: ${sp.duration}ms`);
  return parts.length > 0 ? parts.join("\n") : null;
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
        "Use the sidebar to switch between panels: Session, Program, Hardware, Monitor, and Data. Each handles a different part of the experiment workflow.",
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

    // ── Connection ───────────────────────────────────────
    {
      id: "first-session-4",
      panel: "session",
      target: "port-select",
      title: "Connecting to Hardware",
      content:
        "Try selecting your Arduino's COM port from the dropdown. The system will auto-detect the paradigm and board type from the firmware.",
      placement: "bottom",
      interactive: true,
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

    // ── Program ──────────────────────────────────────────
    {
      id: "first-session-6",
      panel: "program",
      target: "preset-select",
      title: "Session Presets",
      content:
        "Try selecting a preset to auto-fill hardware settings, paradigm parameters, and limits in one click.",
      placement: "bottom",
      interactive: true,
      section: "Program",
    },
    {
      id: "first-session-7",
      panel: "program",
      target: "paradigm-settings",
      title: "Paradigm Settings",
      content:
        "Configure paradigm-specific parameters here. Try adjusting the values — they'll be sent to the Arduino when you start.",
      placement: "bottom",
      interactive: true,
      section: "Program",
      summary: formatParadigmSummary,
    },
    {
      id: "first-session-8",
      panel: "program",
      target: "limit-config",
      title: "Session Limits",
      content:
        "Set how the session ends: by time, infusion count, trial count, or a combination. Try configuring a limit now.",
      placement: "bottom",
      interactive: true,
      section: "Program",
      summary: formatLimitSummary,
    },
    {
      id: "first-session-9",
      panel: "program",
      target: "start-session",
      title: "Starting a Session",
      content:
        "When everything is configured, click Start Session. A review modal will let you verify all settings before the experiment begins.",
      placement: "top",
      section: "Program",
    },

    // ── Hardware ─────────────────────────────────────────
    {
      id: "first-session-10",
      panel: "hardware",
      target: "system-controls",
      title: "System Controls",
      content:
        "Test Chain triggers a full device check. Try toggling Test Mode to manually activate devices without running a program.",
      placement: "bottom",
      interactive: true,
      section: "Hardware",
    },
    {
      id: "first-session-11",
      panel: "hardware",
      target: "lever-card",
      title: "Lever Configuration",
      content:
        "Try arming a lever and setting the timeout duration and ratio. The active lever triggers reinforcement; the inactive lever is tracked separately.",
      placement: "bottom",
      interactive: true,
      section: "Hardware",
      summary: formatLeverSummary,
    },
    {
      id: "first-session-12",
      panel: "hardware",
      target: "cue-card",
      title: "Cue Configuration",
      content:
        "Try configuring auditory cues with frequency and duration. Primary and secondary cues can signal different events.",
      placement: "bottom",
      interactive: true,
      section: "Hardware",
      summary: formatCueSummary,
    },
    {
      id: "first-session-13",
      panel: "hardware",
      target: "pump-card",
      title: "Pump Configuration",
      content:
        "Try setting the infusion duration and arming a pump to enable drug delivery during the session.",
      placement: "bottom",
      interactive: true,
      section: "Hardware",
      summary: formatPumpSummary,
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
      target: "live-stats",
      title: "Live Statistics",
      content:
        "Track elapsed time, lever presses, infusion count, and trial count as the experiment runs.",
      placement: "bottom",
      section: "Monitor",
    },
    {
      id: "first-session-16",
      panel: "monitor",
      target: "experiment-controls",
      title: "Start / Stop / Pause",
      content:
        "Control the running experiment: Start begins the program, Stop ends it, and Pause freezes the timer and event processing.",
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
        "Try setting a filename and destination folder. The system will create a ZIP with behavior events, frame timestamps, and session metadata.",
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
        "You're all set! Reopen this tour from the Help panel (? icon), or try Demo Mode to explore without hardware connected.",
      placement: "center",
      section: "Complete",
      summary: formatCompleteSummary,
    },
  ];
}
