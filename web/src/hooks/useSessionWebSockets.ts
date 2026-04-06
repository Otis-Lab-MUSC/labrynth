import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { ReacherWebSocket } from "../api/websocket";
import { useSessionStore } from "../store/useSessionStore";
import { useMachineStore } from "../store/useMachineStore";
import { useTutorialStore } from "../store/useTutorialStore";
import { useLogStore } from "../store/useLogStore";
import type { LogLevel } from "../store/useLogStore";
import type { WSMessage, BehaviorEvent, FirmwareConfig, SessionState } from "../types";

function normalizeLevel(level: string): LogLevel {
  if (level === "warn" || level === "warning") return "warn";
  if (level === "error") return "error";
  return "info";
}

/** Map firmware config device names to hardwareUi keys for arm-state sync. */
const DEVICE_TO_UI_KEY: Record<string, string> = {
  CUE: "primaryCue",
  CUE2: "secondaryCue",
  PUMP: "primaryPump",
  PUMP2: "secondaryPump",
  LASER: "laser",
  LICK: "lickCircuit",
  MICROSCOPE: "microscope",
  LEVER_RH: "rhLever",
  LEVER_LH: "lhLever",
};

function handleMessage(msg: WSMessage) {
  const { updateState, pushEvent, pushFrame, setFirmwareInfo, pushHardwareSetting, setUploadProgress, updateHardwareUi } =
    useSessionStore.getState();
  const { pushLog } = useLogStore.getState();

  switch (msg.type) {
    case "event": {
      const eventData = msg.data as BehaviorEvent;
      pushEvent(msg.session_id, eventData);
      if (eventData.device === "CONTROLLER" && eventData.event === "END") {
        updateState(msg.session_id, "stopped");
      }
      break;
    }
    case "frame":
      pushFrame(msg.session_id, (msg.data as { timestamp: number }).timestamp);
      break;
    case "config": {
      const configData = msg.data as FirmwareConfig;
      const raw = configData as Record<string, unknown>;
      if (raw.device === "CONTROLLER") {
        setFirmwareInfo(msg.session_id, configData);
      } else {
        pushHardwareSetting(msg.session_id, configData);

        // Sync arm state (and available params) from firmware config into hardwareUi
        const uiKey = DEVICE_TO_UI_KEY[raw.device as string];
        if (uiKey) {
          updateHardwareUi(msg.session_id, (prev) => {
            const current = (prev as unknown as Record<string, Record<string, unknown>>)[uiKey];
            if (!current) return {};
            const patch: Record<string, unknown> = {};
            if (typeof raw.armed === "boolean") patch.armed = raw.armed;
            if (typeof raw.frequency === "number") patch.frequency = raw.frequency;
            if (typeof raw.duration === "number") patch.duration = raw.duration;
            if (typeof raw.reinforced === "boolean") patch.reinforced = raw.reinforced;
            if (typeof raw.timeout === "number") patch.timeout = raw.timeout;
            if (typeof raw.ratio === "number") patch.ratio = raw.ratio;
            if (typeof raw.mode === "string") patch.mode = raw.mode;
            return { [uiKey]: { ...current, ...patch } } as Partial<typeof prev>;
          });
        }
      }
      break;
    }
    case "log": {
      const { level, message } = msg.data as { level: string; message: string };
      pushLog(normalizeLevel(level), message, msg.session_id);
      break;
    }
    case "error": {
      const { desc, device } = msg.data as { desc: string; device: string };
      pushLog("error", `[${device}] ${desc}`, msg.session_id);
      break;
    }
    case "upload_progress": {
      const { percent, stage } = msg.data as { percent: number; stage: string };
      setUploadProgress(msg.session_id, percent, stage);
      pushLog("info", `Upload: ${stage} (${percent}%)`, msg.session_id);
      break;
    }
    case "session_state": {
      const { state } = msg.data as { state: SessionState };
      updateState(msg.session_id, state);
      pushLog("info", `Session ${state}`, msg.session_id);
      break;
    }
    // Fix: XL-003 — Handle serial disconnect event
    case "disconnect": {
      const { reason } = msg.data as { reason: string };
      updateState(msg.session_id, "disconnected");
      pushLog("error", `Serial disconnected: ${reason}`, msg.session_id);
      break;
    }
    // Fix: F-005 — Handle export_failed event from backend
    case "export_failed": {
      const { reason } = msg.data as { reason: string };
      pushLog("error", `Auto-export failed: ${reason}`, msg.session_id);
      break;
    }
    // Fix: F-006 — Handle kernel_error event from backend
    case "kernel_error": {
      const { reason } = msg.data as { reason: string };
      pushLog("error", `Kernel error: ${reason}`, msg.session_id);
      break;
    }
    // Fix: F-014 — Log unhandled message types so future protocol changes are visible
    default:
      console.warn(`[ReacherWS] Unhandled message type: ${(msg as { type: string }).type}`, msg);
      break;
  }
}

async function recoverMissedEvents(sessionId: string) {
  const { sessions, replaceEvents } = useSessionStore.getState();
  const sess = sessions.get(sessionId);
  if (!sess || sess.state !== "running") return;

  const client = useMachineStore.getState().getClient(sess.machineId);
  if (!client) return;

  try {
    const { data, total } = await client.getBehavior(sessionId);
    if (total > sess.behaviorData.length) {
      replaceEvents(sessionId, data as unknown as BehaviorEvent[]);
      useLogStore.getState().pushLog(
        "info",
        `Recovered ${total - sess.behaviorData.length} missed events after reconnect`,
        sessionId,
      );
    }
  } catch (err) {
    console.warn("[ReacherWS] Failed to recover missed events:", err);
  }
}

export function useSessionWebSockets() {
  const { sessionOrder, sessions } = useSessionStore(
    useShallow((s: { sessionOrder: string[]; sessions: Map<string, { draft?: boolean; machineId?: string }> }) => ({
      sessionOrder: s.sessionOrder,
      sessions: s.sessions,
    }))
  );
  const connectionsRef = useRef<Map<string, ReacherWebSocket>>(new Map());
  /** Session IDs for which an async WS token fetch is in-flight. */
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = connectionsRef.current;
    const demoMode = useTutorialStore.getState().demoMode;
    const realIds = sessionOrder.filter((id: string) => !sessions.get(id)?.draft && !(demoMode && id.startsWith("demo-")));
    const activeIds = new Set(realIds);

    // Close connections for removed or draft sessions
    for (const [id, ws] of current) {
      if (!activeIds.has(id)) {
        ws.close();
        current.delete(id);
        pendingRef.current.delete(id);
      }
    }

    // Open connections for new real sessions
    for (const id of realIds) {
      if (current.has(id) || pendingRef.current.has(id)) continue;

      const sess = sessions.get(id);
      const machineClient = sess?.machineId
        ? useMachineStore.getState().getClient(sess.machineId)
        : null;

      if (machineClient?.deviceId) {
        // Proxy client: WS token requires an async fetch from the local server
        pendingRef.current.add(id);
        machineClient.getWsTokenAsync().then((wsInfo) => {
          pendingRef.current.delete(id);
          if (connectionsRef.current.has(id)) return; // already opened by a concurrent update
          if (wsInfo) {
            connectionsRef.current.set(
              id,
              new ReacherWebSocket(id, handleMessage, wsInfo.wsUrl, wsInfo.token, () => recoverMissedEvents(id)),
            );
          }
        });
      } else {
        // Local machine or legacy remote with synchronous token
        current.set(id, new ReacherWebSocket(
          id,
          handleMessage,
          machineClient?.wsBaseUrl,
          machineClient?.getWsToken(),
          () => recoverMissedEvents(id),
        ));
      }
    }
  }, [sessionOrder, sessions]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const ws of connectionsRef.current.values()) {
        ws.close();
      }
      connectionsRef.current.clear();
    };
  }, []);
}
