export interface HelpSection {
  id: string;
  title: string;
  content: string;
  subsections?: HelpSection[];
}

export const HELP_CONTENT: HelpSection[] = [
  {
    id: "overview",
    title: "Overview",
    content:
      "Labrynth is the control interface for REACHER, a neuroscience experiment system for head-fixed rodent operant conditioning. It manages Arduino hardware (levers, pumps, cues, lasers, lick circuits, microscope sync) across five behavioral paradigms: Fixed Ratio (FR), Progressive Ratio (PR), Variable Interval (VI), Omission, and Pavlovian.\n\nThe workflow follows five panels: Session (connect hardware), Program (configure paradigm), Hardware (arm devices), Monitor (run experiment), and Data (export results).",
  },
  {
    id: "session",
    title: "Session Panel",
    content: "The Session panel is where you connect to Arduino hardware and manage session lifecycles.",
    subsections: [
      {
        id: "session.ports",
        title: "COM Ports",
        content:
          "The COM port dropdown lists all detected serial ports on your system. Click Refresh to rescan for newly connected Arduinos. On Windows, ports appear as COM3, COM4, etc. On Linux/macOS, they appear as /dev/ttyUSB0 or /dev/ttyACM0.",
      },
      {
        id: "session.connecting",
        title: "Connecting",
        content:
          "Select a port and click Connect. The system creates a backend session, opens the serial connection at 115200 baud, and auto-detects the paradigm and board type from the firmware. The detected info appears in the Active Session card.",
      },
      {
        id: "session.firmware",
        title: "Firmware Upload",
        content:
          "The Firmware Upload card lets you change the paradigm running on the Arduino. Select a paradigm (FR, PR, VI, Omission, Pavlovian) and board type (UNO, Mega), then click Upload. Progress is shown in the terminal. The Arduino resets after upload and re-handshakes automatically.",
      },
    ],
  },
  {
    id: "program",
    title: "Program Panel",
    content: "The Program panel configures paradigm parameters, session presets, and limits.",
    subsections: [
      {
        id: "program.presets",
        title: "Session Presets",
        content:
          "Session presets pre-configure all settings in one click: hardware arm states, paradigm parameters, and limits. Presets are filtered by the detected paradigm. After selecting a preset, you can still adjust individual settings before starting.",
      },
      {
        id: "program.paradigm",
        title: "Paradigm Settings",
        content:
          "Configure paradigm-specific parameters. For FR: the fixed ratio (presses per reinforcement). For PR: starting ratio and step size. For VI: the variable interval range. For Omission: the omission interval. For Pavlovian: trial timing parameters via a dedicated settings panel.\n\nThe Trace Interval sets the delay between cue offset and reinforcement delivery.",
      },
      {
        id: "program.limits",
        title: "Limits",
        content:
          "Session limits determine when the experiment automatically ends. Options include:\n\n- Time: session ends after a set duration (seconds)\n- Infusion: session ends after a set number of infusions\n- Both: whichever limit is reached first\n- Trials (Pavlovian): session ends after a set number of trials\n\nThe Stop Delay adds a grace period after the limit is reached before actually stopping.",
      },
    ],
  },
  {
    id: "hardware",
    title: "Hardware Panel",
    content: "The Hardware panel provides direct control over all connected devices.",
    subsections: [
      {
        id: "hardware.arming",
        title: "Arm / Disarm",
        content:
          "Each device has an Arm/Disarm toggle. Armed devices are active during the experiment. Disarmed devices are ignored by the firmware. Always verify arm states before starting — unarmed devices won't respond during the session.",
      },
      {
        id: "hardware.levers",
        title: "Levers",
        content:
          "Two levers (RH and LH) can be configured independently. Parameters:\n\n- Timeout: duration (ms) of the timeout period after a reinforced press\n- Ratio: number of active presses required per reinforcement\n\nPress types: Active (counts toward ratio), Timeout (during timeout period), Inactive (non-reinforced lever).",
      },
      {
        id: "hardware.cues",
        title: "Cues",
        content:
          "Two auditory cues (Primary and Secondary) generate tones via speakers. Parameters:\n\n- Frequency: tone pitch in Hz (typically 2000-4000 Hz)\n- Duration: how long the tone plays in ms",
      },
      {
        id: "hardware.pumps",
        title: "Pumps",
        content:
          "Two syringe pumps (Primary and Secondary) deliver infusions. The Duration parameter (ms) controls how long the pump runs per infusion, which determines the volume delivered based on your syringe and pump calibration.",
      },
      {
        id: "hardware.laser",
        title: "Laser",
        content:
          "The laser device supports optogenetic stimulation. Parameters:\n\n- Frequency: pulse frequency in Hz\n- Duration: total stimulation duration in ms\n\nNot available in the Pavlovian paradigm.",
      },
      {
        id: "hardware.lick",
        title: "Lick Circuit",
        content:
          "The lick circuit detects licking behavior via a capacitive sensor. Arm it to record lick events during the session. No additional parameters needed.",
      },
      {
        id: "hardware.microscope",
        title: "Microscope Sync",
        content:
          "The microscope sync output generates TTL pulses for synchronizing with imaging equipment. Arm it to send frame timestamps alongside behavior data.",
      },
    ],
  },
  {
    id: "monitor",
    title: "Monitor Panel",
    content: "The Monitor panel displays real-time experiment data and session controls.",
    subsections: [
      {
        id: "monitor.stats",
        title: "Live Stats",
        content:
          "Displays running totals updated in real-time: elapsed time, total lever presses (broken down by active/timeout/inactive for each lever), infusion count, and trial count (Pavlovian).",
      },
      {
        id: "monitor.timeline",
        title: "Event Timeline",
        content:
          "A scrolling timeline showing all behavior events as they occur. Events are color-coded by device and type. Useful for verifying the experiment is progressing as expected.",
      },
      {
        id: "monitor.controls",
        title: "Session Controls",
        content:
          "Three buttons control the running session:\n\n- Start: begins the experiment program\n- Stop: ends the session immediately\n- Pause/Resume: temporarily freezes the experiment timer and event processing",
      },
    ],
  },
  {
    id: "data",
    title: "Data Panel",
    content: "The Data panel handles file configuration, data export, and session notes.",
    subsections: [
      {
        id: "data.fileconfig",
        title: "File Configuration",
        content:
          "Set the output filename and destination directory. Click Save Config to persist these to the backend. The filename is used as the base name for exported files.",
      },
      {
        id: "data.export",
        title: "Export",
        content:
          "After a session ends, click Export ZIP to save all data. The ZIP contains:\n\n- Behavior events (CSV with device, event, timestamps)\n- Frame timestamps (for microscope sync)\n- Session metadata (paradigm, settings, limits, counts)\n\nExport is only available when behavior data has been recorded.",
      },
    ],
  },
];
