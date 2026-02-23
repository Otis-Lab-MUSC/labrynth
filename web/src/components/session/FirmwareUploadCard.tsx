import { useEffect, useState } from "react";
import * as api from "../../api/client";
import { useFirmwareUpload } from "../../hooks/useFirmwareUpload";
import { useSessionStore } from "../../store/useSessionStore";

interface Props {
  sessionId: string;
}

export function FirmwareUploadCard({ sessionId }: Props) {
  const [paradigms, setParadigms] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const { upload, uploading, error } = useFirmwareUpload(sessionId);
  const progress = useSessionStore((s) => s.uploadProgress.get(sessionId));

  useEffect(() => {
    api.listParadigms().then((r) => setParadigms(r.paradigms)).catch(() => {});
  }, []);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Firmware Upload</h3>
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
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
          onClick={() => upload(selected)}
          disabled={!selected || uploading}
          className="btn-sm bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-black border border-theme-border">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-theme-text/60 font-mono">
            {progress.percent}% — {progress.stage}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-500 font-mono">{error}</p>}
    </div>
  );
}
