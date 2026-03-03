import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { ReacherWebSocket } from "../api/websocket";
import { useSessionStore } from "../store/useSessionStore";
import { useTutorialStore } from "../store/useTutorialStore";
import { useLogStore } from "../store/useLogStore";
import type { LogLevel } from "../store/useLogStore";
import type { WSMessage, BehaviorEvent, FirmwareConfig, SessionState } from "../types";

function normalizeLevel(level: string): LogLevel {
  if (level === "warn" || level === "warning") return "warn";
  if (level === "error") return "error";
  return "info";
}

function handleMessage(msg: WSMessage) {
  const { updateState, pushEvent, pushFrame, setFirmwareInfo, pushHardwareSetting, setUploadProgress } =
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
      if ((configData as Record<string, unknown>).device === "CONTROLLER") {
        setFirmwareInfo(msg.session_id, configData);
      } else {
        pushHardwareSetting(msg.session_id, configData);
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
  }
}

export function useSessionWebSockets() {
  const { sessionOrder, sessions } = useSessionStore(
    useShallow((s: { sessionOrder: string[]; sessions: Map<string, { draft?: boolean }> }) => ({
      sessionOrder: s.sessionOrder,
      sessions: s.sessions,
    }))
  );
  const connectionsRef = useRef<Map<string, ReacherWebSocket>>(new Map());

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
      }
    }

    // Open connections for new real sessions
    for (const id of realIds) {
      if (!current.has(id)) {
        current.set(id, new ReacherWebSocket(id, handleMessage));
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
