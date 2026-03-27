import { useState, useCallback } from "react";
import type { SessionPreset, PresetDeviceEntry } from "./types";
import type { HardwareUiState } from "../../../types";

interface Props {
  preset: SessionPreset;
  onApply: (hardwareOverrides: Record<string, boolean>) => Promise<void>;
}

function DeviceRow({
  entry,
  hardware,
  armed,
  onToggle,
}: {
  entry: PresetDeviceEntry;
  hardware: Partial<HardwareUiState>;
  armed: boolean;
  onToggle: () => void;
}) {
  const device = hardware[entry.key];
  const params: string[] = [];

  if (device) {
    if ("timeout" in device && device.timeout != null && "ratio" in device && device.ratio != null) {
      params.push(`${device.timeout / 1000}s / r${device.ratio}`);
    } else {
      if ("frequency" in device && device.frequency != null) params.push(`${device.frequency >= 1000 ? `${device.frequency / 1000}kHz` : `${device.frequency}Hz`}`);
      if ("duration" in device && device.duration != null) params.push(`${device.duration / 1000}s`);
    }
  }

  return (
    <tr className="border-t border-theme-border/40">
      <td className="py-1.5 pr-3 text-sm font-medium text-theme-text">{entry.label}</td>
      <td className="py-1.5 pr-3 text-sm text-theme-text/60">{entry.role}</td>
      <td className="py-1.5 pr-3">
        <button
          type="button"
          onClick={onToggle}
          className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono cursor-pointer transition-colors ${
            armed
              ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
              : "bg-neutral-600/20 text-neutral-400 hover:bg-neutral-600/30"
          }`}
        >
          {armed ? "armed" : "disarmed"}
        </button>
      </td>
      <td className="py-1.5 text-xs font-mono text-theme-text/50">
        {params.length > 0 ? params.join(" / ") : "\u2014"}
      </td>
    </tr>
  );
}

function formatTimeLimit(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} hr`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

export function SessionPresetCard({ preset, onApply }: Props) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // Initialize toggle state from preset hardware
  const [armState, setArmState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(preset.hardware)) {
      if (value && typeof value === "object" && "armed" in value) {
        initial[key] = value.armed as boolean;
      }
    }
    return initial;
  });

  const handleToggle = useCallback((key: string) => {
    setArmState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });
    // Reset applied state when user changes a toggle after applying
    if (applied) setApplied(false);
  }, [applied]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(armState);
      setApplied(true);
    } finally {
      setApplying(false);
    }
  };

  const { limitDefaults } = preset;
  const showTime = limitDefaults.limitType === "Time" || limitDefaults.limitType === "Both";
  const showInfusion = limitDefaults.limitType === "Infusion" || limitDefaults.limitType === "Both";
  const showTrials = limitDefaults.limitType === "Trials";

  return (
    <div data-tour="preset-card" className="card border-l-4 border-l-accent space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h3 className="font-semibold text-theme-text text-base">{preset.name}</h3>
        <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-mono text-accent uppercase tracking-wide">
          {preset.paradigm}
        </span>
      </div>

      {/* Limit summary */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <span className="text-theme-text/50 font-mono">Limit Type</span>
        <span className="text-theme-text">{limitDefaults.limitType}</span>
        {showTime && (
          <>
            <span className="text-theme-text/50 font-mono">Time Limit</span>
            <span className="text-theme-text">{formatTimeLimit(limitDefaults.timeLimit)}</span>
          </>
        )}
        {showInfusion && (
          <>
            <span className="text-theme-text/50 font-mono">Infusions</span>
            <span className="text-theme-text">{limitDefaults.infusionLimit}</span>
          </>
        )}
        {showTrials && (
          <>
            <span className="text-theme-text/50 font-mono">Trial Limit</span>
            <span className="text-theme-text">{limitDefaults.infusionLimit}</span>
          </>
        )}
        {preset.pavlovianParams && (
          <>
            <span className="text-theme-text/50 font-mono">CS+ Count</span>
            <span className="text-theme-text">{preset.pavlovianParams[208]}</span>
            <span className="text-theme-text/50 font-mono">CS- Count</span>
            <span className="text-theme-text">{preset.pavlovianParams[209]}</span>
            <span className="text-theme-text/50 font-mono">CS+ Reward Prob</span>
            <span className="text-theme-text">{preset.pavlovianParams[206]}%</span>
            <span className="text-theme-text/50 font-mono">Trace Interval</span>
            <span className="text-theme-text">{preset.pavlovianParams[214]}ms</span>
          </>
        )}
      </div>

      {/* Device summary table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs font-mono text-theme-text/40 uppercase tracking-wider">
              <th className="pb-1 pr-3">Device</th>
              <th className="pb-1 pr-3">Role</th>
              <th className="pb-1 pr-3">Status</th>
              <th className="pb-1">Params</th>
            </tr>
          </thead>
          <tbody>
            {preset.devices.map((entry) => (
              <DeviceRow
                key={entry.key}
                entry={entry}
                hardware={preset.hardware}
                armed={armState[entry.key] ?? false}
                onToggle={() => handleToggle(entry.key)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Apply button */}
      <button
        onClick={handleApply}
        disabled={applying || applied}
        className={`btn-sm w-full py-2 font-medium transition-colors ${
          applied
            ? "bg-green-600 text-white"
            : "bg-accent text-accent-contrast hover:bg-accent-hover"
        } disabled:opacity-50`}
      >
        {applying ? "Applying..." : applied ? "Applied!" : "Apply Preset"}
      </button>
    </div>
  );
}
