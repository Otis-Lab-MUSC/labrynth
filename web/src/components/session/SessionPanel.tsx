import { useEffect, useState } from "react";
import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import { useLogStore } from "../../store/useLogStore";
import type { BoardType } from "../../types";
import { FirmwareUploadCard } from "./FirmwareUploadCard";

export function SessionPanel() {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [loading, setLoading] = useState(false);
  const { activeSessionId, sessions, createSession, destroySession, setSessionName, setParadigm, setBoard, updateState } = useSessionStore();

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  useEffect(() => {
    api.listPorts().then((r) => setPorts(r.ports)).catch(() => {});
  }, []);

  const handleConnect = async () => {
    if (!selectedPort) return;
    setLoading(true);
    try {
      const sessionId = await createSession(selectedPort);
      const result = await api.connectSerial(sessionId);
      if (result.detected_paradigm) {
        setParadigm(sessionId, result.detected_paradigm);
      }
      if (result.detected_board) {
        setBoard(sessionId, result.detected_board as BoardType);
      }
      updateState(sessionId, "connected");
      useLogStore.getState().pushLog("info", `Connected to ${selectedPort}`, sessionId);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Failed to connect");
      useLogStore.getState().setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      await api.disconnectSerial(activeSessionId);
      await destroySession(activeSessionId);
      useLogStore.getState().pushLog("info", "Serial disconnected", activeSessionId);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Disconnect failed");
      useLogStore.getState().setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Session</h2>

      {/* Port selection + connect */}
      <div className="card">
        <h3 className="font-medium text-theme-text">COM Port</h3>
        <div className="flex items-center gap-2">
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            className="input-base"
          >
            <option value="">Select port...</option>
            {ports.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={() => api.listPorts().then((r) => setPorts(r.ports))}
            className="btn-sm bg-panel border border-theme-border text-theme-text hover:bg-accent/10"
          >
            Refresh
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedPort || loading || (activeSession != null && !activeSession.draft && activeSession.state !== "idle")}
            className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
          >
            Connect
          </button>
        </div>
      </div>

      {/* Draft session hint */}
      {activeSession?.draft && (
        <div className="card">
          <p className="text-sm text-theme-text/60">
            Select a COM port above and click "Connect" to begin.
          </p>
        </div>
      )}

      {/* Active session info */}
      {activeSession && !activeSession.draft && (
        <div className="card">
          <h3 className="font-medium text-theme-text">Active Session</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-theme-text/60">ID:</span>
            <span className="font-mono text-accent">{activeSession.id}</span>
            <span className="text-theme-text/60">Port:</span>
            <span className="font-mono">{activeSession.port}</span>
            <span className="text-theme-text/60">Board:</span>
            <span className="font-mono">{activeSession.board?.toUpperCase() ?? "—"}</span>
            <span className="text-theme-text/60">Paradigm:</span>
            <span className="font-mono">{activeSession.paradigm?.toUpperCase() ?? "—"}</span>
            <span className="text-theme-text/60">State:</span>
            <span className="capitalize font-mono">{activeSession.state}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm w-28 text-theme-text/60">Name:</label>
            <input
              value={activeSession.name}
              onChange={(e) => setSessionName(activeSessionId!, e.target.value)}
              placeholder="Session name..."
              className="flex-1 input-base"
            />
          </div>
          {(activeSession.state === "connected" || activeSession.state === "stopped") && (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Disconnect Serial
            </button>
          )}
        </div>
      )}

      {/* Firmware upload */}
      {activeSession && !activeSession.draft && (
        <FirmwareUploadCard key={activeSession.id} sessionId={activeSession.id} />
      )}
    </div>
  );
}
