import { getClientForSession } from "../../api/sessionClient";
import { usePluginStore } from "../../store/usePluginStore";
import { useSessionStore } from "../../store/useSessionStore";
import type { PluginManifest } from "../../types/plugin";
import { PinField } from "../hardware/PinField";
import type { Component } from "../hardware/pinMeta";

interface Props {
  manifest: PluginManifest;
  sessionId?: string;
}

export function PluginCard({ manifest, sessionId }: Props) {
  const { isInstalled, installPlugin, uninstallPlugin } = usePluginStore();
  const installed = isInstalled(manifest.id);
  const session = useSessionStore((s) => (sessionId ? s.sessions.get(sessionId) : null));
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  type HwKey = keyof NonNullable<typeof session>["hardwareUi"];
  const deviceKey = manifest.deviceName.toLowerCase() as HwKey;
  const deviceState = session?.hardwareUi[deviceKey] as { armed: boolean } | undefined;
  const isConnected = session?.state === "connected";
  const microscopeArmed = session?.hardwareUi.microscope.armed ?? false;

  const send = (code: number) =>
    sessionId ? getClientForSession(sessionId)?.sendCommand(sessionId, code) : undefined;

  const handleArm = () => {
    if (!sessionId) return;
    send(manifest.commands.arm);
    updateHardwareUi(sessionId, (prev) => ({
      [deviceKey]: { ...(prev[deviceKey] as object), armed: true },
    }));
  };

  const handleDisarm = () => {
    if (!sessionId) return;
    send(manifest.commands.disarm);
    updateHardwareUi(sessionId, (prev) => ({
      [deviceKey]: { ...(prev[deviceKey] as object), armed: false },
    }));
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-theme-text">{manifest.displayName}</h3>
          <p className="text-xs text-theme-text/60 font-mono">v{manifest.version}</p>
        </div>
        <button
          onClick={() => (installed ? uninstallPlugin(manifest.id) : installPlugin(manifest))}
          className={`btn-sm text-xs ${installed ? "btn-toggle-red-on" : "btn-toggle-green-off"}`}
        >
          {installed ? "Uninstall" : "Install"}
        </button>
      </div>
      <p className="text-sm text-theme-text/70 mt-1">{manifest.description}</p>

      {installed && isConnected && sessionId && (
        <div className="mt-3 space-y-2">
          {manifest.requiresMicroscope && !microscopeArmed && (
            <p className="text-xs text-yellow-500 font-mono">
              Warning: Microscope is not armed. SLM timestamps may lack imaging context.
            </p>
          )}
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={handleArm}
              className={`btn-sm ${deviceState?.armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
            >Arm</button>
            <button
              onClick={handleDisarm}
              className={`btn-sm ${!deviceState?.armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
            >Disarm</button>
            {manifest.commands.setPin != null && (
              <PinField sessionId={sessionId} component={manifest.deviceName.toLowerCase() as Component} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
