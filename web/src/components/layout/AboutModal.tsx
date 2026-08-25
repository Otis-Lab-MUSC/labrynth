import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUpdateCheck } from "../../hooks/useUpdateCheck";
import { useUpdateStore } from "../../store/useUpdateStore";
import { getLocalClient } from "../../api/client";
import { downloadDiagnostics } from "../../logging";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  async function handleDiagnostics() {
    setDiagBusy(true);
    setDiagError(null);
    try {
      await downloadDiagnostics();
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDiagBusy(false);
    }
  }

  const { update, dismiss } = useUpdateCheck();
  const { downloadStatus, startDownload } = useUpdateStore(
    useShallow((s) => ({
      downloadStatus: s.downloadStatus,
      startDownload: s.startDownload,
    })),
  );
  const [backendVersion, setBackendVersion] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setBackendVersion(null);
    getLocalClient()
      .probeHealth()
      .then((h) => setBackendVersion(h?.version ?? "offline"))
      .catch(() => setBackendVersion("offline"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        className="w-full max-w-sm rounded-lg border border-theme-border bg-panel p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="about-modal-title" className="text-base font-semibold text-theme-text">
            About Labrynth
          </h3>
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded p-1 opacity-50 transition hover:bg-accent/10 hover:opacity-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <table className="mb-4 w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 pr-4 text-theme-text/60">Labrynth</td>
              <td className="py-1 font-mono text-theme-text">v{__APP_VERSION__}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-theme-text/60">Backend (reacher)</td>
              <td className="py-1 font-mono text-theme-text">
                {backendVersion === null ? (
                  <span className="opacity-40">loading…</span>
                ) : (
                  `v${backendVersion}`
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {update ? (
          <div className="mb-4 rounded border border-accent/30 bg-accent/10 px-3 py-2.5">
            <p className="mb-1 text-sm font-medium text-accent">
              v{update.latestVersion} is available
            </p>
            <div className="flex items-center gap-3">
              <a
                href={update.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                View Release Notes <ExternalLink size={11} />
              </a>
              <button
                onClick={startDownload}
                disabled={downloadStatus !== "idle"}
                className="text-xs text-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download
              </button>
              <button
                onClick={dismiss}
                className="text-xs text-theme-text/50 transition hover:text-theme-text/80"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-theme-text/50">Labrynth is up to date.</p>
        )}

        <div className="border-t border-theme-border pt-3">
          <button
            onClick={handleDiagnostics}
            disabled={diagBusy}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded border border-theme-border px-3 py-2 text-xs text-theme-text/70 transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Download size={11} />
            {diagBusy ? "Preparing…" : "Download diagnostics"}
          </button>
          {diagError && (
            <p className="mb-3 text-xs text-red-500">{diagError}</p>
          )}
          <a
            href="https://github.com/Otis-Lab-MUSC/labrynth"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-theme-text/50 transition hover:text-accent"
          >
            <ExternalLink size={11} />
            GitHub Repository
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
