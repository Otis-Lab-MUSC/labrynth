export interface PluginManifest {
  id: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  /** Firmware serial event level handled by this plugin (e.g. "009" for SLM). */
  eventLevel: string;
  /** Device name as it appears in firmware JSON events (e.g. "SLM"). */
  deviceName: string;
  commands: {
    arm: number;
    disarm: number;
    setPin?: number;
  };
  /** Default pin number for setPin, if applicable. */
  defaultPin?: number;
  /** Pin constraint metadata for UI validation. */
  pinConstraint?: {
    requiresPcint?: boolean;
    allowedPins: number[];
  };
  visualization: {
    type: "instantaneous_tick";
    color: { dark: string; light: string };
    laneLabel: string;
  };
  /** When true, UI shows a warning if microscope is not armed. */
  requiresMicroscope?: boolean;
}
