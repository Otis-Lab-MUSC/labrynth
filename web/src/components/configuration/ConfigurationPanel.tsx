import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSessionStore } from "../../store/useSessionStore";
import { defaultHardwareUiState } from "../../store/useSessionStore";
import { ParadigmSettings } from "../program/ParadigmSettings";
import { PavlovianSettings } from "../program/PavlovianSettings";
import { LimitConfig } from "../program/LimitConfig";
import { DEVICE_PRESETS, PRESET_COMMAND_MAP, LASER_MODE_COMMANDS, PAV_LASER_PHASE_COMMANDS } from "../program/devicePresets";
import type { DevicePreset } from "../program/devicePresets";
import { SESSION_PRESETS, SessionPresetCard, buildPresetFromSession, SavePresetDialog } from "../program/presets";
import type { SessionPreset } from "../program/presets";
import { ConfirmDialog } from "../layout/ConfirmDialog";
import { useUserPresetStore } from "../../store/useUserPresetStore";
import { getClientForSession } from "../../api/sessionClient";
import { LeverControl } from "../hardware/LeverControl";
import { CueControl } from "../hardware/CueControl";
import { PumpControl } from "../hardware/PumpControl";
import { LaserControl } from "../hardware/LaserControl";
import { LickCircuitControl } from "../hardware/LickCircuitControl";
import { MicroscopeControl } from "../hardware/MicroscopeControl";
import { SLMControl } from "../hardware/SLMControl";
import { usePinOverridesHydration } from "../hardware/usePinOverridesHydration";
import { useTutorialStore } from "../../store/useTutorialStore";
import { laserPhaseActive } from "../monitor/hardwareSummary";
import type { CommandSpec, LaserUiState } from "../../types";

/* ── Default baselines for dirty-state detection ─────────────────── */

const DEFAULT_PARADIGM_SETTINGS = { ratio: 1, step: 1, interval: 30000, traceInterval: 0 };

interface Baseline {
  hardwareUi: string;
  paradigmSettings: string;
  pavlovianParams: string;
  limitSettings: string;
}

function snapshotBaseline(session: {
  hardwareUi: unknown;
  paradigmSettings: unknown;
  pavlovianParams: unknown;
  limitSettings: unknown;
}): Baseline {
  return {
    hardwareUi: JSON.stringify(session.hardwareUi),
    paradigmSettings: JSON.stringify(session.paradigmSettings),
    pavlovianParams: JSON.stringify(session.pavlovianParams),
    limitSettings: JSON.stringify(session.limitSettings),
  };
}

function defaultBaseline(): Baseline {
  return {
    hardwareUi: JSON.stringify(defaultHardwareUiState()),
    paradigmSettings: JSON.stringify(DEFAULT_PARADIGM_SETTINGS),
    pavlovianParams: JSON.stringify(null),
    limitSettings: JSON.stringify(null),
  };
}

/* ── Component ───────────────────────────────────────────────────── */

export function ConfigurationPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);
  const setParadigmSettings = useSessionStore((s) => s.setParadigmSettings);
  const setLimitSettings = useSessionStore((s) => s.setLimitSettings);
  const setPavlovianParams = useSessionStore((s) => s.setPavlovianParams);
  const setFileConfig = useSessionStore((s) => s.setFileConfig);

  const userPresets = useUserPresetStore((s) => s.userPresets);
  const saveUserPreset = useUserPresetStore((s) => s.savePreset);
  const deleteUserPreset = useUserPresetStore((s) => s.deletePreset);

  usePinOverridesHydration(activeSessionId);

  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [selectedDevicePresetId, setSelectedDevicePresetId] = useState<string>("");
  const [presetKey, setPresetKey] = useState(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Hardware section collapse state
  const [hardwareExpanded, setHardwareExpanded] = useState(false);
  const [commands, setCommands] = useState<CommandSpec[]>([]);

  // Dirty-state baseline: factory defaults until a preset is applied
  const baselineRef = useRef<Baseline>(defaultBaseline());

  const paradigm = session?.paradigm?.toLowerCase();
  const isPav = paradigm === "pavlovian";

  // Fetch commands for hardware section
  useEffect(() => {
    if (!activeSessionId) return;
    getClientForSession(activeSessionId)?.getCommands(activeSessionId).then((r) => {
      setCommands(r.commands as unknown as CommandSpec[]);
    }).catch(() => {});
  }, [activeSessionId, session?.paradigm]);

  // Auto-expand hardware section when tutorial navigates to a hardware step
  const tutorialActive = useTutorialStore((s) => s.active);
  const tutorialTarget = useTutorialStore((s) => s.steps[s.currentStepIndex]?.target);

  useEffect(() => {
    if (tutorialActive) {
      const hardwareTargets = ["system-controls", "lever-card", "cue-card", "pump-card"];
      if (hardwareTargets.includes(tutorialTarget)) {
        setHardwareExpanded(true);
      }
    }
  }, [tutorialActive, tutorialTarget]);

  // Session presets filtered by paradigm
  const filteredSessionPresets = useMemo(() => {
    const builtIn = SESSION_PRESETS.filter((p) => paradigm && p.paradigm === paradigm);
    const custom = userPresets.filter((p) => paradigm && p.paradigm === paradigm);
    return { builtIn, custom };
  }, [paradigm, userPresets]);

  // Device presets filtered by paradigm (existing system)
  const filteredDevicePresets = useMemo(
    () =>
      DEVICE_PRESETS.filter(
        (p) => p.paradigms === null || (paradigm && p.paradigms.includes(paradigm))
      ),
    [paradigm]
  );

  const selectedSessionPreset =
    filteredSessionPresets.builtIn.find((p) => p.id === selectedPresetId) ??
    filteredSessionPresets.custom.find((p) => p.id === selectedPresetId);

  /* ── Dirty-state detection ───────────────────────────────────── */

  const isCustomized = useMemo(() => {
    if (!session || !session.paradigm) return false;
    const current = snapshotBaseline(session);
    const base = baselineRef.current;
    return (
      current.hardwareUi !== base.hardwareUi ||
      current.paradigmSettings !== base.paradigmSettings ||
      current.pavlovianParams !== base.pavlovianParams ||
      current.limitSettings !== base.limitSettings
    );
  }, [
    session?.hardwareUi,
    session?.paradigmSettings,
    session?.pavlovianParams,
    session?.limitSettings,
    session?.paradigm,
  ]);

  /* ── Preset handlers ─────────────────────────────────────────── */

  const handleSavePreset = (name: string) => {
    if (!session || !session.paradigm) return;
    const preset = buildPresetFromSession(name, session);
    saveUserPreset(preset);
    setSaveDialogOpen(false);
    setSelectedPresetId(preset.id);
    // The saved state becomes the new baseline
    baselineRef.current = snapshotBaseline(session);
  };

  const handleDeletePreset = (id: string) => {
    deleteUserPreset(id);
    setDeleteConfirm(null);
    if (selectedPresetId === id) setSelectedPresetId("");
  };

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
        if ((deviceKey === "rhLever" || deviceKey === "lhLever") && paradigm === "pavlovian") continue;
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
      const laserState = preset.hardware.laser as LaserUiState | undefined;
      if (laserState?.mode) {
        // Pavlovian trial-paired modes require contingent (681) before filter command
        if (laserState.mode !== "independent" && laserState.mode !== "contingent" && laserState.mode !== "rh_lever" && laserState.mode !== "lh_lever") {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,681);
        }
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,LASER_MODE_COMMANDS[laserState.mode]);
      }

      // 2c. Send laser phase command if Pavlovian preset specifies a phase
      if (laserPhaseActive(isPav, laserState?.mode, laserState?.phase)) {
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

    // 7. Snapshot the post-apply state as the new baseline (deferred to next tick
    //    so the store has flushed the updates above)
    setTimeout(() => {
      const updated = useSessionStore.getState().sessions.get(activeSessionId);
      if (updated) baselineRef.current = snapshotBaseline(updated);
    }, 0);
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
        if ((deviceKey === "rhLever" || deviceKey === "lhLever") && paradigm === "pavlovian") continue;
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
      const laserState = preset.hardware.laser as LaserUiState | undefined;
      if (laserState?.mode) {
        // Pavlovian trial-paired modes require contingent (681) before filter command
        if (laserState.mode !== "independent" && laserState.mode !== "contingent" && laserState.mode !== "rh_lever" && laserState.mode !== "lh_lever") {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,681);
        }
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,LASER_MODE_COMMANDS[laserState.mode]);
      }

      // Send laser phase command if preset specifies a phase
      if (laserPhaseActive(isPav, laserState?.mode, laserState?.phase)) {
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

  /* ── File config handlers ────────────────────────────────────── */

  const handleSaveConfig = async () => {
    if (!activeSessionId || !session) return;
    const confirmed = await getClientForSession(activeSessionId)?.setFileConfig(activeSessionId, {
      filename: session.fileConfig.filename || undefined,
      destination: session.fileConfig.destination || undefined,
    });
    if (confirmed) setFileConfig(activeSessionId, confirmed);
  };

  const handleBrowse = async () => {
    if (!activeSessionId) return;
    const client = getClientForSession(activeSessionId);
    if (!client || client.isRemote) return;
    try {
      const res = await client.browseFolder();
      if (res.path) setFileConfig(activeSessionId, { destination: res.path });
    } catch { /* picker unavailable — silently ignore */ }
  };

  /* ── Hardware section helpers ─────────────────────────────────── */

  const testMode = session?.hardwareUi.testMode ?? false;
  const showSystemControls = paradigm !== "pavlovian";

  const handleTestChain = () => {
    if (activeSessionId) getClientForSession(activeSessionId)?.sendCommand(activeSessionId, 103);
  };
  const handleTestMode = () => {
    if (!activeSessionId) return;
    const next = !testMode;
    updateHardwareUi(activeSessionId, () => ({ testMode: next }));
    getClientForSession(activeSessionId)?.sendCommand(activeSessionId, 104, next ? 1 : 0);
  };

  /* ── Render ──────────────────────────────────────────────────── */

  if (!activeSessionId || !session || session.draft) {
    return <p className="text-theme-text/60 font-mono">No active session.</p>;
  }

  const isRemoteSession = getClientForSession(activeSessionId)?.isRemote ?? false;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Session Configuration</h2>

      {/* ── File Configuration ───────────────────────────────── */}
      <div data-tour="file-config" className="card">
        <h3 className="font-medium text-theme-text">File Configuration</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm w-28 text-theme-text/60">Filename:</label>
          <input
            value={session.fileConfig.filename}
            onChange={(e) => setFileConfig(activeSessionId, { filename: e.target.value })}
            placeholder="What would you like to name this file? (e.g., experiment_001)"
            className="flex-1 input-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm w-28 text-theme-text/60">Destination:</label>
          <input
            value={session.fileConfig.destination}
            onChange={(e) => setFileConfig(activeSessionId, { destination: e.target.value })}
            placeholder="Where would you like to save this data? (e.g., ~/Downloads)"
            className="flex-1 input-base"
          />
          {!isRemoteSession && (
            <button onClick={handleBrowse} className="btn-sm bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors font-mono shrink-0">
              Browse
            </button>
          )}
        </div>
        <button onClick={handleSaveConfig} className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover">
          Save Config
        </button>
      </div>

      {/* ── Program Section ──────────────────────────────────── */}

      {/* Session Preset Selector */}
      {(filteredSessionPresets.builtIn.length > 0 || filteredSessionPresets.custom.length > 0) && (
        <div data-tour="preset-select" className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-theme-text">Session Preset</h3>
            {isCustomized && (session.state === "connected" || session.state === "paused") && session.paradigm && (
              <button
                onClick={() => setSaveDialogOpen(true)}
                className="btn-sm bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors font-mono"
              >
                Save Preset
              </button>
            )}
          </div>
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="input-base"
          >
            <option value="">Select a session preset...</option>
            {filteredSessionPresets.builtIn.length > 0 && (
              <optgroup label="Built-in">
                {filteredSessionPresets.builtIn.map((p) => (
                  <option key={p.id} value={p.id}>{p.menuLabel ?? p.name}</option>
                ))}
              </optgroup>
            )}
            {filteredSessionPresets.custom.length > 0 && (
              <optgroup label="Custom">
                {filteredSessionPresets.custom.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {/* Session Preset Card (when selected) */}
      {selectedSessionPreset && (
        <SessionPresetCard
          key={selectedSessionPreset.id}
          preset={selectedSessionPreset}
          onApply={(overrides) => applySessionPreset(selectedSessionPreset, overrides)}
          isUserPreset={selectedSessionPreset.id.startsWith("user-")}
          onDelete={() => setDeleteConfirm(selectedSessionPreset.id)}
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

      {/* ── Hardware Section (collapsible) ───────────────────── */}

      <div className="card">
        <button
          onClick={() => setHardwareExpanded((v) => !v)}
          className="flex w-full items-center justify-between py-1 text-left"
        >
          <div>
            <h3 className="font-medium text-theme-text">Hardware Controls</h3>
            <p className="text-sm text-theme-text/60 font-mono">
              Paradigm: <span className="font-medium text-accent">{session.paradigm?.toUpperCase() ?? "Unknown"}</span>
              {" — "}{commands.length} commands available
            </p>
          </div>
          {hardwareExpanded ? (
            <ChevronDown size={20} className="shrink-0 text-accent" />
          ) : (
            <ChevronRight size={20} className="shrink-0 text-theme-text/40" />
          )}
        </button>

        {hardwareExpanded && (
          <div className="mt-4 space-y-4">
            {/* System Controls */}
            {showSystemControls && (
              <div data-tour="system-controls" className="rounded-lg border border-theme-border/30 p-3">
                <h4 className="text-sm font-medium text-theme-text mb-2">System Controls</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleTestChain}
                    className="btn-sm bg-yellow-600 text-white"
                  >
                    Test Chain
                  </button>
                  <button
                    onClick={handleTestMode}
                    className={`btn-sm ${testMode ? "btn-toggle-accent-on" : "btn-toggle-accent-off"}`}
                  >
                    Test Mode: {testMode ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-6 divide-y divide-theme-text/10">
              {/* Input Devices */}
              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-theme-text/70 uppercase tracking-wide">Input Devices</h4>
                <div className="grid gap-4 lg:grid-cols-2">
                  {paradigm !== "pavlovian" && (
                    <>
                      <div data-tour="lever-card"><LeverControl sessionId={activeSessionId} side="RH" paradigm={paradigm} /></div>
                      <LeverControl sessionId={activeSessionId} side="LH" paradigm={paradigm} />
                    </>
                  )}
                  <LickCircuitControl sessionId={activeSessionId} />
                </div>
              </section>

              {/* Output Devices */}
              <section className="space-y-4 pt-6">
                <h4 className="text-sm font-semibold text-theme-text/70 uppercase tracking-wide">Output Devices</h4>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div data-tour="cue-card"><CueControl sessionId={activeSessionId} label="1" prefix="" paradigm={paradigm} /></div>
                  <CueControl sessionId={activeSessionId} label="2" prefix="2" paradigm={paradigm} />
                  <div data-tour="pump-card"><PumpControl sessionId={activeSessionId} label="1" prefix="" paradigm={paradigm} /></div>
                  <PumpControl sessionId={activeSessionId} label="2" prefix="2" paradigm={paradigm} />
                  <LaserControl sessionId={activeSessionId} paradigm={paradigm} />
                </div>
              </section>

              {/* Two-Photon Devices */}
              <section className="space-y-4 pt-6">
                <h4 className="text-sm font-semibold text-theme-text/70 uppercase tracking-wide">Two-Photon Devices</h4>
                <div className="grid gap-4 lg:grid-cols-2">
                  <MicroscopeControl sessionId={activeSessionId} />
                  <SLMControl sessionId={activeSessionId} />
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────── */}

      <SavePresetDialog
        open={saveDialogOpen}
        onSave={handleSavePreset}
        onCancel={() => setSaveDialogOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete Preset"
        message="This will permanently remove this custom preset."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteConfirm && handleDeletePreset(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
