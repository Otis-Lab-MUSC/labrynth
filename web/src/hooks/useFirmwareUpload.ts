import { useState } from "react";
import type { BoardType } from "../types";
import * as api from "../api/client";
import { useSessionStore } from "../store/useSessionStore";

export function useFirmwareUpload(sessionId: string | null) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateState, setParadigm, setBoard } = useSessionStore();

  const upload = async (paradigm: string, board: BoardType = "uno") => {
    if (!sessionId || uploading) return;
    setUploading(true);
    setError(null);
    updateState(sessionId, "uploading");

    try {
      await api.uploadFirmware(sessionId, paradigm, board);
      setParadigm(sessionId, paradigm);
      setBoard(sessionId, board);
      updateState(sessionId, "connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      updateState(sessionId, "idle");
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, error };
}
