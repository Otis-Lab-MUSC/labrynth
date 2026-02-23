import { useEffect, useRef } from "react";
import { ReacherWebSocket } from "../api/websocket";
import { useSessionStore } from "../store/useSessionStore";
import type { WSMessage, BehaviorEvent, FirmwareConfig, SessionState } from "../types";

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<ReacherWebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const { updateState, pushEvent, pushFrame, setFirmwareInfo, pushHardwareSetting, setUploadProgress } =
      useSessionStore.getState();

    const handler = (msg: WSMessage) => {
      switch (msg.type) {
        case "event": {
          const eventData = msg.data as BehaviorEvent;
          pushEvent(msg.session_id, eventData);
          // Firmware END is authoritative — transition to stopped
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
    };

    wsRef.current = new ReacherWebSocket(sessionId, handler);
    return () => wsRef.current?.close();
  }, [sessionId]);
}
