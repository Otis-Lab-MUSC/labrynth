import { useState, useMemo } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { ParadigmSettings } from "./ParadigmSettings";
import { PavlovianSettings } from "./PavlovianSettings";
import { LimitConfig } from "./LimitConfig";
import { DEVICE_PRESETS, PRESET_COMMAND_MAP } from "./devicePresets";
import type { DevicePreset } from "./devicePresets";
import * as api from "../../api/client";

export function ProgramPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const setStartModalOpen = useSessionStore((s) => s.setStartModalOpen);

  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const paradigm = session?.paradigm?.toLowerCase();

  const filteredPresets = useMemo(
    () =>
      DEVICE_PRESETS.filter(
        (p) => p.paradigms === null || (paradigm && p.paradigms.includes(paradigm))
      ),
    [paradigm]
  );

  const applyPreset = async (preset: DevicePreset) => {
    if (!activeSessionId) return;

    // Deep-merge preset hardware into current hardwareUi
    updateHardwareUi(activeSessionId, (prev) => {
      const result = { ...prev };
      for (const [key, value] of Object.entries(preset.hardware)) {
        if (key === "testMode") {
          result.testMode = value as boolean;
        } else if (key in result) {
          (result as unknown as Record<string, unknown>)[key] = { ...(prev as unknown as Record<string, unknown>)[key] as object, ...(value as object) };
        }
      }
      return result;
    });

    // Send hardware commands if session is connected
    if (session?.state === "connected") {
      for (const [deviceKey, deviceState] of Object.entries(preset.hardware)) {
        const mapping = PRESET_COMMAND_MAP[deviceKey];
        if (!mapping || deviceKey === "testMode") continue;

        const state = deviceState as { armed?: boolean; [k: string]: unknown };
        // Arm/disarm
        if (state.armed !== undefined) {
          await api.sendCommand(activeSessionId, state.armed ? mapping.arm : mapping.disarm);
        }
        // Send params
        if (mapping.params) {
          for (const [paramKey, code] of Object.entries(mapping.params)) {
            if (state[paramKey] !== undefined) {
              await api.sendCommand(activeSessionId, code, state[paramKey] as number);
            }
          }
        }
      }
    }
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = filteredPresets.find((p) => p.id === presetId);
    if (preset) applyPreset(preset);
  };

  const selectedPreset = filteredPresets.find((p) => p.id === selectedPresetId);
  const canStart = session?.state === "connected" || session?.state === "stopped";

  if (!activeSessionId || !session || session.draft) {
    return <p className="text-theme-text/60 font-mono">No active session.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Program Configuration</h2>

      {/* Device Preset Dropdown */}
      {filteredPresets.length > 0 && (
        <div className="card">
          <h3 className="font-medium text-theme-text">Device Preset</h3>
          <select
            value={selectedPresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="input-base"
          >
            <option value="">Select a preset...</option>
            {filteredPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selectedPreset && (
            <p className="text-sm text-theme-text/60 mt-1">{selectedPreset.description}</p>
          )}
        </div>
      )}

      {paradigm === "pavlovian" ? (
        <PavlovianSettings key={`settings-${activeSessionId}`} sessionId={activeSessionId} />
      ) : (
        <ParadigmSettings key={`settings-${activeSessionId}`} sessionId={activeSessionId} paradigm={paradigm ?? "fr"} />
      )}

      <LimitConfig key={`limits-${activeSessionId}`} sessionId={activeSessionId} paradigm={paradigm} />

      {/* Start Session button */}
      {canStart && (
        <button
          onClick={() => setStartModalOpen(true)}
          className="w-full rounded bg-green-600 px-4 py-3 text-white font-mono text-lg hover:bg-green-700"
        >
          Start Session
        </button>
      )}
    </div>
  );
}
