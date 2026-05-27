import { useEffect, useState } from "react";
import type { BoardType } from "../../types";
import * as api from "../../api/client";
import { useFirmwareUpload } from "../../hooks/useFirmwareUpload";
import { useSessionStore } from "../../store/useSessionStore";

interface Props {
  sessionId: string;
}

export function FirmwareUploadCard({ sessionId }: Props) {
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
    setSelectedParadigm("");
    api.listParadigms(selectedBoard).then((r) => setParadigms(r.paradigms)).catch(() => {});
  }, [selectedBoard]);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Firmware Upload</h3>
      <div className="flex items-center gap-2">
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

      {/* Upload activity indicator (indeterminate) */}
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full border border-theme-border bg-black">
            <div className="h-full w-full rounded-full bg-accent/70 animate-pulse" />
          </div>
          {progress?.stage && (
            <p className="text-xs text-theme-text/60 font-mono">{progress.stage}</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500 font-mono">{error}</p>}
    </div>
  );
}
