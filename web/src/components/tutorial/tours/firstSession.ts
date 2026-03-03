import type { TutorialStep } from "../../../store/useTutorialStore";

export function firstSessionTour(): TutorialStep[] {
  return [
    {
      id: "first-session-1",
      panel: null,
      target: "header",
      title: "Welcome to Labrynth",
      content:
        "This is the control interface for REACHER experiments. Let's walk through the session setup flow step by step.",
      placement: "bottom",
    },
    {
      id: "first-session-2",
      panel: "session",
      target: "sidebar",
      title: "Navigation",
      content:
        "Use the sidebar to switch between panels. Each panel handles a different part of the experiment workflow: Session, Program, Hardware, Monitor, and Data.",
      placement: "right",
    },
    {
      id: "first-session-3",
      panel: "session",
      target: "new-session",
      title: "Creating a Session",
      content:
        "Click the + button to create a new session tab. You can run multiple sessions simultaneously, each connected to a different Arduino.",
      placement: "bottom",
    },
    {
      id: "first-session-4",
      panel: "session",
      target: "port-select",
      title: "Connecting to Hardware",
      content:
        "Select your Arduino's COM port from the dropdown and click Connect. The system will auto-detect the paradigm and board type from the firmware.",
      placement: "bottom",
    },
    {
      id: "first-session-5",
      panel: "session",
      target: "firmware-card",
      title: "Firmware Upload",
      content:
        "If you need to change paradigms, use this card to upload different firmware to the Arduino. Select the paradigm and board type, then click Upload.",
      placement: "bottom",
    },
    {
      id: "first-session-6",
      panel: "program",
      target: "preset-select",
      title: "Session Presets",
      content:
        "Presets pre-configure hardware settings, paradigm parameters, and limits in one click. Select a preset to auto-fill the settings below.",
      placement: "bottom",
    },
    {
      id: "first-session-7",
      panel: "program",
      target: "paradigm-settings",
      title: "Paradigm Settings",
      content:
        "Configure paradigm-specific parameters here: ratio for FR/PR, interval for VI, trace interval, and more. These are sent to the Arduino when you start.",
      placement: "bottom",
    },
    {
      id: "first-session-8",
      panel: "program",
      target: "limit-config",
      title: "Session Limits",
      content:
        "Set how the session ends: by time, infusion count, trial count, or a combination. The Arduino enforces these limits automatically.",
      placement: "bottom",
    },
    {
      id: "first-session-9",
      panel: "program",
      target: "start-session",
      title: "Starting a Session",
      content:
        "When everything is configured, click Start Session. A review modal will let you verify all settings before the experiment begins.",
      placement: "top",
    },
    {
      id: "first-session-10",
      panel: "hardware",
      target: "system-controls",
      title: "System Controls",
      content:
        "Test Chain triggers a full device check. Test Mode lets you manually activate devices without running a program — useful for troubleshooting.",
      placement: "bottom",
    },
    {
      id: "first-session-11",
      panel: "hardware",
      target: "lever-card",
      title: "Lever Configuration",
      content:
        "Arm/disarm levers and set timeout duration and ratio. The active lever triggers reinforcement; the inactive lever is tracked but has no programmed consequence.",
      placement: "bottom",
    },
    {
      id: "first-session-12",
      panel: "hardware",
      target: "cue-card",
      title: "Cue Configuration",
      content:
        "Configure auditory cues with frequency (Hz) and duration (ms). Primary and secondary cues can signal different events during the session.",
      placement: "bottom",
    },
    {
      id: "first-session-13",
      panel: "hardware",
      target: "pump-card",
      title: "Pump Configuration",
      content:
        "Set the infusion duration for syringe pumps. Arm the pump to enable drug delivery during the session.",
      placement: "bottom",
    },
    {
      id: "first-session-14",
      panel: "monitor",
      target: "monitor-heading",
      title: "Monitor Panel",
      content:
        "The Monitor panel shows real-time experiment data. The running mouse indicator shows whether the session is active, paused, or waiting.",
      placement: "bottom",
    },
    {
      id: "first-session-15",
      panel: "monitor",
      target: "live-stats",
      title: "Live Statistics",
      content:
        "Track elapsed time, lever presses (active, timeout, inactive), infusion count, and trial count as the experiment runs.",
      placement: "bottom",
    },
    {
      id: "first-session-16",
      panel: "monitor",
      target: "experiment-controls",
      title: "Start / Stop / Pause",
      content:
        "Control the running experiment: Start begins the program, Stop ends it, and Pause freezes the timer and event processing.",
      placement: "bottom",
    },
    {
      id: "first-session-17",
      panel: "data",
      target: "file-config",
      title: "File Configuration",
      content:
        "Set the filename and destination folder for data export. The system will create a ZIP file with behavior events, frame timestamps, and session metadata.",
      placement: "bottom",
    },
    {
      id: "first-session-18",
      panel: "data",
      target: "export-card",
      title: "Data Export",
      content:
        "After the session ends, click Export ZIP to save all recorded data. The export includes behavior events, frame timestamps, and a session summary.",
      placement: "bottom",
    },
    {
      id: "first-session-19",
      panel: null,
      target: "terminal-bar",
      title: "Terminal",
      content:
        "The terminal shows log messages from the system: connection events, errors, upload progress, and session state changes. Click to expand.",
      placement: "top",
    },
    {
      id: "first-session-20",
      panel: null,
      target: "",
      title: "Tour Complete",
      content:
        "You're all set! Remember: you can reopen this tour from the Help panel (? icon), and try Demo Mode to explore without hardware connected.",
      placement: "center",
    },
  ];
}
