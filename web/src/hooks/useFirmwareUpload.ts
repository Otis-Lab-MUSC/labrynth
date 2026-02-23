import { useState } from "react";
import * as api from "../api/client";
import { useSessionStore } from "../store/useSessionStore";

export function useFirmwareUpload(sessionId: string | null) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateState, setParadigm } = useSessionStore();

  const upload = async (paradigm: string) => {
    if (!sessionId || uploading) return;
    setUploading(true);
    setError(null);
    updateState(sessionId, "uploading");

    try {
      await api.uploadFirmware(sessionId, paradigm);
      setParadigm(sessionId, paradigm);
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
