import { useSessionStore } from "../../store/useSessionStore";
import { useMachineStore } from "../../store/useMachineStore";
import { getClientForSession } from "../../api/sessionClient";
import { ArduinoConfig } from "./ArduinoConfig";
import { SessionNotes } from "./SessionNotes";

export function DataExport() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );
  const setFileConfig = useSessionStore((s) => s.setFileConfig);
  const setExportState = useSessionStore((s) => s.setExportState);
  const machines = useMachineStore((s) => s.machines);

  if (!activeSessionId || !session || session.draft) {
    return <p className="text-theme-text/60 font-mono">No active session.</p>;
  }

  const { filename, destination } = session.fileConfig;
  const { exporting, result: exportResult, error: exportError } = session.exportState;

  const handleSaveConfig = async () => {
    const confirmed = await getClientForSession(activeSessionId)?.setFileConfig(activeSessionId, {
      filename: filename || undefined,
      destination: destination || undefined,
    });
    if (confirmed) setFileConfig(activeSessionId, confirmed);
  };

  const handleZipExport = async () => {
    setExportState(activeSessionId, { exporting: true, result: null, error: null });
    try {
      const micro = session.hardwareUi.microscope;
      const result = await getClientForSession(activeSessionId)?.exportZip(activeSessionId, {
        session_name: session.name || undefined,
        notes: session.notes || undefined,
        infusion_count: session.infusionCount,
        press_count: session.pressCount,
        trial_count: session.trialCount,
        program_start_time: session.programStartTime,
        ...(micro.armed && micro.frameRate != null && { microscope_frame_rate: micro.frameRate }),
        ...(micro.armed && micro.frameAveraging != null && { microscope_frame_averaging: micro.frameAveraging }),
      });
      // For remote/proxy sessions the browser download is the only way the user
      // receives the file; for local sessions the file is already on disk.
      const client = getClientForSession(activeSessionId);
      if (result?.file_path && client?.isRemote) {
        try {
          await client.downloadExportZip(activeSessionId, result.file_path);
        } catch {
          // Download failed — the server-side path is still shown as fallback
        }
      }
      setExportState(activeSessionId, { exporting: false, result: result?.file_path ?? null });
    } catch (e) {
      setExportState(activeSessionId, {
        exporting: false,
        error: e instanceof Error ? e.message : "ZIP export failed",
      });
    }
  };

  const hasData = session.behaviorData.length > 0;
  const machine = session.machineId ? machines.find((m) => m.deviceId === session.machineId) : null;
  const isHostOffline = session.state === "disconnected" || (!machine?.isLocal && machine?.online === false);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Data</h2>

      {/* File config */}
      <div data-tour="file-config" className="card">
        <h3 className="font-medium text-theme-text">File Configuration</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm w-28 text-theme-text/60">Filename:</label>
          <input
            value={filename}
            onChange={(e) => setFileConfig(activeSessionId, { filename: e.target.value })}
            placeholder="experiment_001"
            className="flex-1 input-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm w-28 text-theme-text/60">Destination:</label>
          <input
            value={destination}
            onChange={(e) => setFileConfig(activeSessionId, { destination: e.target.value })}
            placeholder="~/Downloads"
            className="flex-1 input-base"
          />
        </div>
        <button onClick={handleSaveConfig} className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover">
          Save Config
        </button>
      </div>

      {/* Export */}
      <div data-tour="export-card" className="card">
        <h3 className="font-medium text-theme-text">Export</h3>
        <p className="text-sm text-theme-text/60 font-mono">
          {session.behaviorData.length} behavior events, {session.frameData.length} frame timestamps
        </p>
        {isHostOffline && (
          <p className="text-sm font-mono text-red-400">
            Export unavailable while host is offline. Data is preserved on the remote device and can be exported after reconnecting.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZipExport}
            disabled={!hasData || exporting || isHostOffline}
            className={`rounded px-4 py-1.5 text-sm font-mono ${
              hasData && !isHostOffline
                ? "bg-accent text-accent-contrast hover:bg-accent-hover"
                : "bg-gray-700 text-gray-500 pointer-events-none"
            } disabled:opacity-50`}
          >
            {exporting ? "Exporting..." : "Export ZIP"}
          </button>
        </div>
        {exportResult && (
          <p className="text-sm text-green-400 font-mono mt-2">
            Saved to: {exportResult}
          </p>
        )}
        {exportError && (
          <p className="text-sm text-red-400 font-mono mt-2">
            Error: {exportError}
          </p>
        )}
      </div>

      {/* Arduino Config */}
      <ArduinoConfig
        firmwareInfo={session.firmwareInfo}
        hardwareSettings={session.hardwareSettings}
        paradigm={session.paradigm ?? undefined}
      />

      {/* Session Notes */}
      <SessionNotes sessionId={activeSessionId} notes={session.notes} />

      {/* Data preview */}
      {session.behaviorData.length > 0 && (
        <div className="rounded-lg border border-theme-border bg-panel p-4">
          <h3 className="mb-2 font-medium text-theme-text">Preview (last 20 events)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-theme-border">
                  <th className="px-2 py-1 text-left text-theme-text/60">Device</th>
                  <th className="px-2 py-1 text-left text-theme-text/60">Event</th>
                  <th className="px-2 py-1 text-left text-theme-text/60">Start TS</th>
                  <th className="px-2 py-1 text-left text-theme-text/60">End TS</th>
                </tr>
              </thead>
              <tbody>
                {session.behaviorData.slice(-20).map((e, i) => (
                  <tr key={i} className="border-b border-theme-border">
                    <td className="px-2 py-1 text-accent">{e.device}</td>
                    <td className="px-2 py-1">{e.event}</td>
                    <td className="px-2 py-1 tabular-nums">{e.start_timestamp}</td>
                    <td className="px-2 py-1 tabular-nums">{e.end_timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
