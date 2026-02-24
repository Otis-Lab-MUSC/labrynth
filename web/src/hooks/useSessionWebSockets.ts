import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { ReacherWebSocket } from "../api/websocket";
import { useSessionStore } from "../store/useSessionStore";
import type { WSMessage, BehaviorEvent, FirmwareConfig, SessionState } from "../types";

function handleMessage(msg: WSMessage) {
  const { updateState, pushEvent, pushFrame, setFirmwareInfo, pushHardwareSetting, setUploadProgress } =
    useSessionStore.getState();

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
    case "upload_progress": {
      const { percent, stage } = msg.data as { percent: number; stage: string };
      setUploadProgress(msg.session_id, percent, stage);
      break;
    }
    case "session_state":
      updateState(msg.session_id, (msg.data as { state: SessionState }).state);
      break;
  }
}

export function useSessionWebSockets() {
  const sessionOrder = useSessionStore(useShallow((s) => s.sessionOrder));
  const connectionsRef = useRef<Map<string, ReacherWebSocket>>(new Map());

  useEffect(() => {
    const current = connectionsRef.current;
    const activeIds = new Set(sessionOrder);

    // Close connections for removed sessions
    for (const [id, ws] of current) {
      if (!activeIds.has(id)) {
        ws.close();
        current.delete(id);
      }
    }

    // Open connections for new sessions
    for (const id of sessionOrder) {
      if (!current.has(id)) {
        current.set(id, new ReacherWebSocket(id, handleMessage));
      }
    }
  }, [sessionOrder]);

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
