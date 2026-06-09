import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { BoardType } from "../../types";
import * as api from "../../api/client";
import { useFirmwareUpload } from "../../hooks/useFirmwareUpload";
import { useSessionStore } from "../../store/useSessionStore";

interface Props {
  sessionId: string;
  detectedBoard?: string | null;
}

export function FirmwareUploadCard({ sessionId, detectedBoard }: Props) {
  const [boards, setBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBoard, setSelectedBoard] = useState<BoardType>("uno");
  const [paradigms, setParadigms] = useState<string[]>([]);
  const [selectedParadigm, setSelectedParadigm] = useState("");
  const { upload, uploading, error } = useFirmwareUpload(sessionId);
  const progress = useSessionStore((s) => s.uploadProgress.get(sessionId));

  useEffect(() => {
    api.listBoards().then((r) => setBoards(r.boards)).catch(() => {});
  }, []);

  useEffect(() => {
    if (detectedBoard) setSelectedBoard(detectedBoard as BoardType);
  }, [detectedBoard]);

  useEffect(() => {
    setSelectedParadigm("");
    api.listParadigms(selectedBoard).then((r) => setParadigms(r.paradigms)).catch(() => {});
  }, [selectedBoard]);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Firmware Upload</h3>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <select
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value as BoardType)}
            className="input-base"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {detectedBoard && selectedBoard === detectedBoard && (
            <span className="text-xs text-theme-text/50 font-mono">Auto-detected</span>
          )}
        </div>
        <select
          value={selectedParadigm}
          onChange={(e) => setSelectedParadigm(e.target.value)}
          className="input-base"
        >
          <option value="">Select paradigm...</option>
          {paradigms.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>
        <button
          onClick={() => upload(selectedParadigm, selectedBoard)}
          disabled={!selectedParadigm || uploading}
          className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {uploading && (
        <div className="flex items-center gap-2 font-mono text-xs text-theme-text/60">
          <Loader2 size={14} className="animate-spin text-accent shrink-0" />
          <span>{progress?.stage ?? "Uploading…"}</span>
        </div>
      )}

      {error && <p className="text-sm text-red-500 font-mono">{error}</p>}
    </div>
  );
}
