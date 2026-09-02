/**
 * Human-facing release notes shown in the About dialog.
 *
 * Audience is the bench scientist running the rig, not a developer — entries
 * describe what changed about *using the app*, in plain language, not what
 * changed in the code. This is hand-written and deliberately separate from
 * the root CHANGELOG.md (an engineering changelog: file names, PR/issue
 * links, refactors, CI). Add an entry here only when a release has a
 * user-visible change worth telling a researcher about; skip internal-only
 * releases rather than translating every CHANGELOG.md line.
 */

export interface InterfaceChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

// Newest first.
export const INTERFACE_CHANGELOG: InterfaceChangelogEntry[] = [
  {
    version: "3.0.1-alpha.21",
    date: "2026-09-01",
    highlights: [
      "On VI and Omission rigs, choosing \"LH lever\" for the laser now actually switches it — previously the display updated but the rig kept stimulating the old lever.",
      "Infusion counts no longer reset to zero if your session reconnects mid-run.",
      "Lick-circuit pin assignments now display correctly after a reconnect.",
    ],
  },
  {
    version: "3.0.1-alpha.12",
    date: "2026-07-27",
    highlights: [
      "fr_lite sessions now have ready-made presets (High/Mid/Low/Extinction), matching what was already available for FR.",
    ],
  },
  {
    version: "3.0.1-alpha.11",
    date: "2026-07-24",
    highlights: [
      "FR self-administration presets now deliver the reward right as the cue tone ends, as originally designed — previously it fired at the same instant the cue started.",
      "The Two-Photon Devices section is now hidden for UNO-based rigs, since that hardware doesn't support it.",
    ],
  },
];
