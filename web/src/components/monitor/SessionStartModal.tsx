import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSessionStore } from "../../store/useSessionStore";
import { useLogStore } from "../../store/useLogStore";
import { useNavigationStore } from "../../store/useNavigationStore";
import { getClientForSession } from "../../api/sessionClient";
import { PRESET_COMMAND_MAP, LASER_MODE_COMMANDS, PAV_LASER_PHASE_COMMANDS } from "../program/devicePresets";
import { ParadigmFlowDiagram } from "./ParadigmFlowDiagram";

const PAV_CODE_LABELS: Record<number, string> = {
  206: "CS+ Reward Prob (%)",
  207: "CS- Reward Prob (%)",
  208: "CS+ Count",
  209: "CS- Count",
  210: "CS+ Frequency (Hz)",
  211: "CS- Frequency (Hz)",
  213: "Cue Duration (ms)",
  214: "Trace Interval (ms)",
  216: "ITI Mean (ms)",
  217: "ITI Min (ms)",
  218: "ITI Max (ms)",
  374: "CS+ Pulse On (ms)",
  375: "CS+ Pulse Off (ms)",
  384: "CS- Pulse On (ms)",
  385: "CS- Pulse Off (ms)",
};

const DEVICE_LABELS: Record<string, string> = {
  rhLever: "RH Lever",
  lhLever: "LH Lever",
  primaryCue: "Primary Cue",
  secondaryCue: "Secondary Cue",
  primaryPump: "Primary Pump",
  secondaryPump: "Secondary Pump",
  laser: "Laser",
  lickCircuit: "Lick Circuit",
  microscope: "Microscope",
};

function formatDeviceParams(key: string, device: Record<string, unknown>, isPav: boolean): string {
  const parts: string[] = [];
  if ("timeout" in device && device.timeout !== undefined) parts.push(`T:${Number(device.timeout) / 1000}s`);
  if ("ratio" in device && device.ratio !== undefined) parts.push(`R:${device.ratio}`);
  if ("frequency" in device && device.frequency !== undefined) parts.push(`${device.frequency}Hz`);
  if ("duration" in device && device.duration !== undefined) {
    const durStr = `${device.duration}ms`;
    parts.push(durStr);
  }
  // Laser-specific: mode and phase
  if (key === "laser") {
    const mode = device.mode as string | undefined;
    if (mode === "independent") {
      parts.push("Independent");
    } else if (mode) {
      const filterLabel: Record<string, string> = {
        contingent: "Contingent", cs_plus: "CS+", cs_minus: "CS\u2212", cs_both: "CS\u00B1",
      };
      parts.push(`Trial-Paired (${filterLabel[mode] ?? mode})`);
    }
    if (isPav && mode !== "independent" && device.phase) {
      const phaseLabel: Record<string, string> = { reward: "Reward", cue: "Cue" };
      parts.push(`Phase: ${phaseLabel[device.phase as string] ?? device.phase}`);
    }
  }
  return parts.join("  ");
}

export function SessionStartModal() {
  const startModalOpen = useSessionStore((s) => s.startModalOpen);
  const setStartModalOpen = useSessionStore((s) => s.setStartModalOpen);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const setSessionName = useSessionStore((s) => s.setSessionName);
  const setLimitSettings = useSessionStore((s) => s.setLimitSettings);

  const [starting, setStarting] = useState(false);

  // Inline-editable limit fields
  const [limitType, setLimitType] = useState("");
  const [timeLimit, setTimeLimit] = useState(3600);
  const [infusionLimit, setInfusionLimit] = useState(30);
  const [delay, setDelay] = useState(10);
  const [name, setName] = useState("");

  const paradigm = session?.paradigm?.toLowerCase();
  const isPavlovian = paradigm === "pavlovian";

  // Sync local state when modal opens or session changes
  useEffect(() => {
    if (!startModalOpen || !session) return;
    setLimitType(session.limitSettings?.limitType ?? (isPavlovian ? "Trials" : "Time"));
    setTimeLimit(session.limitSettings?.timeLimit ?? 3600);
    setInfusionLimit(session.limitSettings?.infusionLimit ?? 30);
    setDelay(session.limitSettings?.delay ?? 10);
    // Auto-generate name if empty
    const autoName = session.name || `${(session.paradigm ?? "Session").toUpperCase()} ${session.port}`;
    setName(autoName);
  }, [startModalOpen, session?.id]);

  const handleStart = useCallback(async () => {
    if (!activeSessionId || !session) return;
    setStarting(true);
    try {
      // Build limit payload with only relevant fields
      const limitPayload: { type: string; time_limit?: number; infusion_limit?: number; delay?: number } = {
        type: limitType,
      };
      if (limitType === "Time" || limitType === "Both") {
        limitPayload.time_limit = timeLimit;
      }
      if (limitType === "Infusion" || limitType === "Both" || limitType === "Trials") {
        limitPayload.infusion_limit = infusionLimit;
        limitPayload.delay = delay;
      }
      await getClientForSession(activeSessionId)?.setLimit(activeSessionId, limitPayload);
      setLimitSettings(activeSessionId, { limitType, timeLimit, infusionLimit, delay });

      // Persist name
      if (name !== session.name) {
        setSessionName(activeSessionId, name);
      }

      // Send Pavlovian params before starting
      if (session.paradigm === "pavlovian" && session.pavlovianParams) {
        for (const [code, value] of Object.entries(session.pavlovianParams)) {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,Number(code), value);
        }
      }

      // Send paradigm settings to ensure they reach the firmware even if
      // applySessionPreset's command block was skipped (e.g. state-sync delay
      // on remote sessions).  Mirrors the codes used in ConfigurationPanel.tsx.
      if (session.paradigmSettings && paradigm !== "pavlovian") {
        const client = getClientForSession(activeSessionId);
        if (paradigm === "fr" || paradigm === "pr") {
          await client?.sendCommand(activeSessionId, 201, session.paradigmSettings.ratio);
        }
        if (paradigm === "pr") {
          await client?.sendCommand(activeSessionId, 205, session.paradigmSettings.step);
        }
        if (paradigm === "vi") {
          await client?.sendCommand(activeSessionId, 204, session.paradigmSettings.interval);
        }
        if (paradigm === "omission") {
          await client?.sendCommand(activeSessionId, 203, session.paradigmSettings.interval);
        }
        if (paradigm === "fr" || paradigm === "pr" || paradigm === "vi") {
          await client?.sendCommand(activeSessionId, 220, session.paradigmSettings.traceInterval);
        }
      }

      // Send hardware state to firmware — only for armed devices.
      // Unarmed devices are left at firmware defaults (already disarmed).
      const hw = session.hardwareUi;
      for (const [deviceKey, deviceState] of Object.entries(hw)) {
        const mapping = PRESET_COMMAND_MAP[deviceKey];
        if (!mapping || deviceKey === "testMode") continue;
        const state = deviceState as { armed?: boolean; [k: string]: unknown };
        if (!state.armed) continue;
        if ((deviceKey === "rhLever" || deviceKey === "lhLever") && isPavlovian) continue;

        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId, mapping.arm);
        // Send device params (frequency, duration, timeout, ratio)
        if (mapping.params) {
          for (const [paramKey, code] of Object.entries(mapping.params)) {
            if (state[paramKey] !== undefined && state[paramKey] !== null) {
              await getClientForSession(activeSessionId)?.sendCommand(activeSessionId, code, state[paramKey] as number);
            }
          }
        }
      }

      // Send laser mode + Pavlovian-specific commands
      const laserState = hw.laser;
      if (laserState?.mode) {
        // For trial-paired modes, send contingent (681) first, then filter command
        if (laserState.mode !== "independent" && laserState.mode !== "contingent") {
          await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,681);
        }
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,LASER_MODE_COMMANDS[laserState.mode as keyof typeof LASER_MODE_COMMANDS]);
      }
      if (isPavlovian && laserState?.phase) {
        await getClientForSession(activeSessionId)?.sendCommand(activeSessionId,PAV_LASER_PHASE_COMMANDS[laserState.phase as keyof typeof PAV_LASER_PHASE_COMMANDS]);
      }

      await getClientForSession(activeSessionId)?.startProgram(activeSessionId);
      useNavigationStore.getState().setActivePanel("monitor");
      setStartModalOpen(false);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Failed to start program");
      useLogStore.getState().setOpen(true);
    } finally {
      setStarting(false);
    }
  }, [activeSessionId, session, limitType, timeLimit, infusionLimit, delay, name]);

  if (!startModalOpen || !session) return null;

  const hw = session.hardwareUi;
  const devices = Object.entries(hw)
    .filter(([key]) => key !== "testMode")
    .filter(([key]) => !isPavlovian || (key !== "rhLever" && key !== "lhLever")) as [string, { armed: boolean; [k: string]: unknown }][];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-theme-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 space-y-5">
          <h2 className="text-xl font-semibold text-theme-text">Review Session Configuration</h2>

          {/* Session Info */}
          <section>
            <h3 className="text-sm font-medium text-theme-text/60 uppercase tracking-wide mb-2">Session</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-theme-text/60">Port:</span>
              <span className="font-mono">{session.port}</span>
              <span className="text-theme-text/60">Paradigm:</span>
              <span className="font-mono">{session.paradigm?.toUpperCase() ?? "—"}</span>
              <span className="text-theme-text/60">Board:</span>
              <span className="font-mono">{session.board?.toUpperCase() ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <label className="text-sm text-theme-text/60">Name:</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 input-base"
                placeholder="Session name..."
              />
            </div>
          </section>

          {/* Program Settings (read-only) */}
          <section>
            <h3 className="text-sm font-medium text-theme-text/60 uppercase tracking-wide mb-2">Program Settings</h3>
            {session.paradigmSettings ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {(paradigm === "fr" || paradigm === "pr") && (
                  <>
                    <span className="text-theme-text/60">Ratio:</span>
                    <span className="font-mono">{session.paradigmSettings.ratio}</span>
                  </>
                )}
                {paradigm === "pr" && (
                  <>
                    <span className="text-theme-text/60">PR Step:</span>
                    <span className="font-mono">{session.paradigmSettings.step}</span>
                  </>
                )}
                {(paradigm === "vi" || paradigm === "omission") && (
                  <>
                    <span className="text-theme-text/60">Interval:</span>
                    <span className="font-mono">{session.paradigmSettings.interval} ms</span>
                  </>
                )}
                {(paradigm === "fr" || paradigm === "pr" || paradigm === "vi") && (
                  <>
                    <span className="text-theme-text/60">Trace Interval:</span>
                    <span className="font-mono">{session.paradigmSettings.traceInterval} ms</span>
                  </>
                )}
              </div>
            ) : isPavlovian && session.pavlovianParams ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(session.pavlovianParams)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([code, value]) => (
                    <span key={code} className="contents">
                      <span className="text-theme-text/60">{PAV_CODE_LABELS[Number(code)] ?? `Code ${code}`}:</span>
                      <span className="font-mono">{value}</span>
                    </span>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-theme-text/60">Using defaults</p>
            )}
          </section>

          {/* Paradigm Flow */}
          {paradigm && (
            <section>
              <h3 className="text-sm font-medium text-theme-text/60 uppercase tracking-wide mb-2">
                Paradigm Flow
              </h3>
              <div className="border border-theme-border rounded p-3 bg-accent/5">
                <ParadigmFlowDiagram
                  paradigm={paradigm}
                  hardwareUi={session.hardwareUi}
                  paradigmSettings={session.paradigmSettings}
                  pavlovianParams={session.pavlovianParams}
                />
              </div>
            </section>
          )}

          {/* Limits (inline-editable) */}
          <section>
            <h3 className="text-sm font-medium text-theme-text/60 uppercase tracking-wide mb-2">Limits</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm w-32 text-theme-text/60">Type:</label>
                <select value={limitType} onChange={(e) => setLimitType(e.target.value)} className="input-base">
                  {isPavlovian ? (
                    <>
                      <option value="Trials">Trials</option>
                      <option value="Infusion">Infusion</option>
                    </>
                  ) : (
                    <>
                      <option value="Time">Time</option>
                      <option value="Infusion">Infusion</option>
                      <option value="Both">Both</option>
                    </>
                  )}
                </select>
              </div>
              {!isPavlovian && (limitType === "Time" || limitType === "Both") && (
                <div className="flex items-center gap-2">
                  <label className="text-sm w-32 text-theme-text/60">Time Limit (s):</label>
                  <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(+e.target.value)} className="w-24 input-base" />
                </div>
              )}
              {(limitType === "Infusion" || limitType === "Both" || limitType === "Trials") && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-sm w-32 text-theme-text/60">
                      {limitType === "Trials" ? "Trial Limit:" : "Infusion Limit:"}
                    </label>
                    <input type="number" value={infusionLimit} onChange={(e) => setInfusionLimit(+e.target.value)} className="w-24 input-base" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm w-32 text-theme-text/60">Stop Delay (s):</label>
                    <input type="number" value={delay} onChange={(e) => setDelay(+e.target.value)} className="w-24 input-base" />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Hardware Summary (read-only) */}
          <section>
            <h3 className="text-sm font-medium text-theme-text/60 uppercase tracking-wide mb-2">Hardware</h3>
            <div className="border border-theme-border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-accent/5 text-theme-text/60">
                    <th className="text-left px-3 py-1.5 font-medium">Device</th>
                    <th className="text-left px-3 py-1.5 font-medium">Status</th>
                    <th className="text-left px-3 py-1.5 font-medium">Settings</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(([key, state]) => (
                    <tr key={key} className="border-t border-theme-border/50">
                      <td className="px-3 py-1.5 text-theme-text">{DEVICE_LABELS[key] ?? key}</td>
                      <td className="px-3 py-1.5">
                        {state.armed ? (
                          <span className="text-green-500 font-mono text-xs">Armed</span>
                        ) : (
                          <span className="text-theme-text/30 font-mono text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-theme-text/60">
                        {state.armed ? formatDeviceParams(key, state as Record<string, unknown>, isPavlovian) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setStartModalOpen(false)}
              className="rounded border border-theme-border px-4 py-2 text-theme-text font-mono hover:bg-accent/10"
            >
              Back to Settings
            </button>
            <button
              onClick={handleStart}
              disabled={starting || session.state === "running"}
              className="rounded bg-green-600 px-6 py-2 text-white font-mono hover:bg-green-700 disabled:opacity-50"
            >
              {starting ? "Starting…" : "Start Session"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
