import { useEffect, useState } from "react";
import { useMachineStore } from "../../store/useMachineStore";
import { getClientForSession } from "../../api/sessionClient";
import { useSessionStore } from "../../store/useSessionStore";
import { useLogStore } from "../../store/useLogStore";
import type { BoardType, Session } from "../../types";
import { FirmwareUploadCard } from "./FirmwareUploadCard";
import { ConfirmDialog } from "../layout/ConfirmDialog";
import { MachineManagement } from "./MachineManagement";

function getDisconnectWarning(session: Session): { title: string; message: string; variant: "danger" | "warning" } | null {
  if (session.programStartTime !== null) {
    return {
      title: "Disconnect session?",
      message: `"${session.name}" has been run. Session logs are saved, but unexported data will need to be recovered from log files.`,
      variant: "danger",
    };
  }
  if (session.behaviorData.length > 0) {
    return {
      title: "Disconnect session with data?",
      message: `"${session.name}" has ${session.behaviorData.length} recorded events that have not been exported. Session logs are saved, but you will need to recover data from log files if not exported now.`,
      variant: "danger",
    };
  }
  if (session.paradigmSettings !== null || session.limitSettings !== null) {
    return {
      title: "Disconnect session?",
      message: `"${session.name}" has unsaved configuration changes.`,
      variant: "warning",
    };
  }
  return null;
}

export function SessionPanel() {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { activeSessionId, sessions, createSession, destroySession, setSessionName, setParadigm, setBoard, updateState } = useSessionStore();
  const { machines, activeMachineId, setActiveMachine, getClient } = useMachineStore();

  const activeMachine = machines.find((m) => m.deviceId === activeMachineId);
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  // Probe health immediately when machine selection changes, then refresh ports
  useEffect(() => {
    if (!activeMachineId) {
      setPorts([]);
      return;
    }
    const client = getClient(activeMachineId);
    if (!client) return;
    // Immediately check if the machine is reachable (don't wait for 30s poll)
    client.probeHealth().then((h) => {
      const online = h?.service === "reacher";
      useMachineStore.getState().setMachineOnline(activeMachineId, online);
      if (online) {
        client.listPorts()
          .then((r) => setPorts(r.ports))
          .catch((e: unknown) => {
            useLogStore.getState().pushLog(
              "error",
              e instanceof Error ? e.message : "Failed to load COM ports",
            );
            useLogStore.getState().setOpen(true);
          });
      } else {
        setPorts([]);
      }
    });
  }, [activeMachineId]);

  const handleConnect = async () => {
    if (!selectedPort || !activeMachineId) return;
    setLoading(true);
    try {
      const sessionId = await createSession(activeMachineId, selectedPort);
      const client = getClientForSession(sessionId);
      const result = await client!.connectSerial(sessionId);
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

  const doDisconnect = async () => {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      const client = getClientForSession(activeSessionId);
      await client?.disconnectSerial(activeSessionId);
      await destroySession(activeSessionId);
      useLogStore.getState().pushLog("info", "Serial disconnected", activeSessionId);
    } catch (e) {
      useLogStore.getState().pushLog("error", e instanceof Error ? e.message : "Disconnect failed");
      useLogStore.getState().setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    if (!activeSession) return;
    const warning = getDisconnectWarning(activeSession);
    if (warning) {
      setConfirmOpen(true);
    } else {
      doDisconnect();
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Session</h2>

      {/* Machine selection */}
      <div className="card">
        <h3 className="font-medium text-theme-text">Machine</h3>
        <div className="flex items-center gap-2">
          <select
            value={activeMachineId ?? ""}
            onChange={(e) => {
              setActiveMachine(e.target.value);
              setSelectedPort("");
            }}
            className="input-base"
          >
            {machines.length === 0 && <option value="">No machines available</option>}
            {machines.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.name}{m.isLocal ? " (local)" : ` — ${m.hostname}`}{!m.online ? " [offline]" : ""}
              </option>
            ))}
          </select>
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              activeMachine?.online ? "bg-green-500" : "bg-red-500/60"
            }`}
            title={activeMachine?.online ? "Online" : "Offline"}
          />
        </div>
        {activeMachine && !activeMachine.isLocal && (
          <p className="mt-1 text-xs text-theme-text/50 font-mono">{activeMachine.url}</p>
        )}
      </div>

      {/* Inline device management */}
      <details data-tour="machine-management" className="card">
        <summary className="font-medium text-theme-text cursor-pointer select-none">Manage Devices</summary>
        <MachineManagement />
      </details>

      {/* Port selection + connect */}
      <div data-tour="port-select" className="card">
        <h3 className="font-medium text-theme-text">COM Port</h3>
        <div className="flex items-center gap-2">
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={!activeMachine?.online}
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
            onClick={() => {
              const client = activeMachineId ? getClient(activeMachineId) : null;
              client?.listPorts().then((r) => setPorts(r.ports));
            }}
            disabled={!activeMachine?.online}
            className="btn-sm bg-panel border border-theme-border text-theme-text hover:bg-accent/10 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedPort || loading || !activeMachine?.online || (activeSession != null && !activeSession.draft && activeSession.state !== "idle")}
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
        <div data-tour="active-session" className="card">
          <h3 className="font-medium text-theme-text">Active Session</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-theme-text/60">Machine:</span>
            <span className="font-mono text-theme-text/80">
              {machines.find((m) => m.deviceId === activeSession.machineId)?.name ?? activeSession.machineId}
            </span>
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
          {(activeSession.state === "connected" || activeSession.state === "stopped" || activeSession.state === "disconnected") && (
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
        <div data-tour="firmware-card"><FirmwareUploadCard key={activeSession.id} sessionId={activeSession.id} /></div>
      )}

      {(() => {
        const warning = activeSession ? getDisconnectWarning(activeSession) : null;
        return (
          <ConfirmDialog
            open={confirmOpen}
            title={warning?.title ?? ""}
            message={warning?.message ?? ""}
            variant={warning?.variant ?? "warning"}
            confirmLabel="Disconnect"
            onConfirm={() => { doDisconnect(); setConfirmOpen(false); }}
            onCancel={() => setConfirmOpen(false)}
          />
        );
      })()}
    </div>
  );
}
