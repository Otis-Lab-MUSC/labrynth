import { useState, useMemo } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { ParadigmSettings } from "./ParadigmSettings";
import { PavlovianSettings } from "./PavlovianSettings";
import { LimitConfig } from "./LimitConfig";
import { DEVICE_PRESETS, PRESET_COMMAND_MAP, LASER_MODE_COMMANDS, PAV_LASER_PHASE_COMMANDS } from "./devicePresets";
import type { DevicePreset } from "./devicePresets";
import { SESSION_PRESETS, SessionPresetCard } from "./presets";
import type { SessionPreset } from "./presets";
import { getClientForSession } from "../../api/sessionClient";

export function ProgramPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const setParadigmSettings = useSessionStore((s) => s.setParadigmSettings);
  const setLimitSettings = useSessionStore((s) => s.setLimitSettings);
  const setStartModalOpen = useSessionStore((s) => s.setStartModalOpen);
  const setPavlovianParams = useSessionStore((s) => s.setPavlovianParams);

  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [selectedDevicePresetId, setSelectedDevicePresetId] = useState<string>("");
  const [presetKey, setPresetKey] = useState(0);

  const paradigm = session?.paradigm?.toLowerCase();

  // Session presets filtered by paradigm
  const filteredSessionPresets = useMemo(
    () => SESSION_PRESETS.filter((p) => paradigm && p.paradigm === paradigm),
    [paradigm]
  );

  // Device presets filtered by paradigm (existing system)
  const filteredDevicePresets = useMemo(
    () =>
      DEVICE_PRESETS.filter(
        (p) => p.paradigms === null || (paradigm && p.paradigms.includes(paradigm))
      ),
    [paradigm]
  );

  const selectedSessionPreset = filteredSessionPresets.find((p) => p.id === selectedPresetId);

  // Apply a session preset: hardware + paradigm settings + limits + commands
  const applySessionPreset = async (preset: SessionPreset, armOverrides: Record<string, boolean>) => {
    if (!activeSessionId) return;

    // 1. Deep-merge hardware state with arm overrides from card toggles
    updateHardwareUi(activeSessionId, (prev) => {
      const result = { ...prev };
      for (const [key, value] of Object.entries(preset.hardware)) {
        if (key === "testMode") {
          result.testMode = value as boolean;
        } else if (key in result) {
          const merged = {
            ...(prev as unknown as Record<string, unknown>)[key] as object,
            ...(value as object),
          };
          if (key in armOverrides) {
            (merged as Record<string, unknown>).armed = armOverrides[key];
          }
          (result as unknown as Record<string, unknown>)[key] = merged;
        }
      }
      // Disarm devices NOT mentioned in the preset (full-takeover semantics)
      for (const deviceKey of Object.keys(PRESET_COMMAND_MAP)) {
        if (!(deviceKey in preset.hardware)) {
          ((result as unknown as Record<string, Record<string, unknown>>)[deviceKey]).armed = false;
        }
      }
      return result;
    });

    // 2. Send ARM/DISARM + param commands if connected or stopped (pre-start states)
    if (session?.state === "connected" || session?.state === "stopped") {
      for (const [deviceKey, deviceState] of Object.entries(preset.hardware)) {
        const mapping = PRESET_COMMAND_MAP[deviceKey];
        if (!mapping || deviceKey === "testMode") continue;

        const state = deviceState as { armed?: boolean; [k: string]: unknown };
        const armed = deviceKey in armOverrides ? armOverrides[deviceKey] : state.armed;
        if (armed !== undefined) {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,armed ? mapping.arm : mapping.disarm);
        }
        if (mapping.params) {
          for (const [paramKey, code] of Object.entries(mapping.params)) {
            if (state[paramKey] !== undefined) {
              await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,code, state[paramKey] as number);
            }
          }
        }
      }

      // Send DISARM for devices NOT mentioned in the preset
      for (const [deviceKey, mapping] of Object.entries(PRESET_COMMAND_MAP)) {
        if (!(deviceKey in preset.hardware)) {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,mapping.disarm);
        }
      }

      // 2b. Send laser mode command if preset specifies a mode
      const laserState = preset.hardware.laser as { mode?: keyof typeof LASER_MODE_COMMANDS; phase?: "reward" | "cue" } | undefined;
      if (laserState?.mode) {
        // Trial-paired modes require contingent (681) before filter command
        if (laserState.mode !== "independent" && laserState.mode !== "contingent") {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,681);
        }
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,LASER_MODE_COMMANDS[laserState.mode]);
      }

      // 2c. Send laser phase command if Pavlovian preset specifies a phase
      if (laserState?.phase) {
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,PAV_LASER_PHASE_COMMANDS[laserState.phase]);
      }

      // 3. Send paradigm-specific commands
      if (preset.pavlovianParams) {
        for (const [code, value] of Object.entries(preset.pavlovianParams)) {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,Number(code), value);
        }
      } else {
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,201, preset.paradigmSettings.ratio);
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,220, preset.paradigmSettings.traceInterval);
      }
    }

    // 4. Update paradigm settings in store
    setParadigmSettings(activeSessionId, preset.paradigmSettings);

    // 4b. Update Pavlovian params in store if present
    if (preset.pavlovianParams) {
      setPavlovianParams(activeSessionId, preset.pavlovianParams);
    }

    // 5. Update limit settings in store
    setLimitSettings(activeSessionId, preset.limitDefaults);

    // 6. Force remount of ParadigmSettings/LimitConfig
    setPresetKey((k) => k + 1);
  };

  // Apply a device-only preset (existing system)
  const applyDevicePreset = async (preset: DevicePreset) => {
    if (!activeSessionId) return;

    updateHardwareUi(activeSessionId, (prev) => {
      const result = { ...prev };
      for (const [key, value] of Object.entries(preset.hardware)) {
        if (key === "testMode") {
          result.testMode = value as boolean;
        } else if (key in result) {
          (result as unknown as Record<string, unknown>)[key] = {
            ...(prev as unknown as Record<string, unknown>)[key] as object,
            ...(value as object),
          };
        }
      }
      return result;
    });

    if (session?.state === "connected") {
      for (const [deviceKey, deviceState] of Object.entries(preset.hardware)) {
        const mapping = PRESET_COMMAND_MAP[deviceKey];
        if (!mapping || deviceKey === "testMode") continue;

        const state = deviceState as { armed?: boolean; [k: string]: unknown };
        if (state.armed !== undefined) {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,state.armed ? mapping.arm : mapping.disarm);
        }
        if (mapping.params) {
          for (const [paramKey, code] of Object.entries(mapping.params)) {
            if (state[paramKey] !== undefined) {
              await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,code, state[paramKey] as number);
            }
          }
        }
      }

      // Send laser mode command if preset specifies a mode
      const laserState = preset.hardware.laser as { mode?: keyof typeof LASER_MODE_COMMANDS; phase?: "reward" | "cue" } | undefined;
      if (laserState?.mode) {
        // Trial-paired modes require contingent (681) before filter command
        if (laserState.mode !== "independent" && laserState.mode !== "contingent") {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,681);
        }
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,LASER_MODE_COMMANDS[laserState.mode]);
      }

      // Send laser phase command if preset specifies a phase
      if (laserState?.phase) {
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,PAV_LASER_PHASE_COMMANDS[laserState.phase]);
      }
    }
  };

  const handleDevicePresetChange = (presetId: string) => {
    setSelectedDevicePresetId(presetId);
    const preset = filteredDevicePresets.find((p) => p.id === presetId);
    if (preset) applyDevicePreset(preset);
  };

  const selectedDevicePreset = filteredDevicePresets.find((p) => p.id === selectedDevicePresetId);
  const canStart = session?.state === "connected" || session?.state === "stopped";

  if (!activeSessionId || !session || session.draft) {
    return <p className="text-theme-text/60 font-mono">No active session.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Program Configuration</h2>

      {/* Session Preset Selector */}
      {filteredSessionPresets.length > 0 && (
        <div data-tour="preset-select" className="card">
          <h3 className="font-medium text-theme-text">Session Preset</h3>
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="input-base"
          >
            <option value="">Select a session preset...</option>
            {filteredSessionPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.menuLabel ?? p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Session Preset Card (when selected) */}
      {selectedSessionPreset && (
        <SessionPresetCard
          key={selectedSessionPreset.id}
          preset={selectedSessionPreset}
          onApply={(overrides) => applySessionPreset(selectedSessionPreset, overrides)}
        />
      )}

      {/* Divider between preset and settings */}
      {selectedSessionPreset && <hr className="border-theme-border/40" />}

      {/* Paradigm Settings */}
      <div data-tour="paradigm-settings">
        {paradigm === "pavlovian" ? (
          <PavlovianSettings key={`settings-${activeSessionId}-${presetKey}`} sessionId={activeSessionId} />
        ) : (
          <ParadigmSettings key={`settings-${activeSessionId}-${presetKey}`} sessionId={activeSessionId} paradigm={paradigm ?? "fr"} />
        )}
      </div>

      {/* Limit Config */}
      <div data-tour="limit-config">
        <LimitConfig key={`limits-${activeSessionId}-${presetKey}`} sessionId={activeSessionId} paradigm={paradigm} />
      </div>

      {/* Device Preset Dropdown (existing system, only if presets exist) */}
      {filteredDevicePresets.length > 0 && (
        <div className="card">
          <h3 className="font-medium text-theme-text">Device Preset</h3>
          <select
            value={selectedDevicePresetId}
            onChange={(e) => handleDevicePresetChange(e.target.value)}
            className="input-base"
          >
            <option value="">Select a preset...</option>
            {filteredDevicePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selectedDevicePreset && (
            <p className="text-sm text-theme-text/60 mt-1">{selectedDevicePreset.description}</p>
          )}
        </div>
      )}

      {/* Start Session button */}
      {canStart && (
        <button
          data-tour="start-session"
          onClick={() => setStartModalOpen(true)}
          className="w-full rounded bg-green-600 px-4 py-3 text-white font-mono text-lg hover:bg-green-700"
        >
          Start Session
        </button>
      )}
    </div>
  );
}
