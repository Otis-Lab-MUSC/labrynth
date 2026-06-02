import { useShallow } from "zustand/react/shallow";
import { useUpdateCheck } from "../../hooks/useUpdateCheck";
import { useUpdateStore } from "../../store/useUpdateStore";

export function UpdateBanner() {
  const { update, dismiss } = useUpdateCheck();
  const { downloadStatus, downloadPercent, downloadError, startDownload, launchInstaller } = useUpdateStore(
    useShallow((s) => ({
      downloadStatus: s.downloadStatus,
      downloadPercent: s.downloadPercent,
      downloadError: s.downloadError,
      startDownload: s.startDownload,
      launchInstaller: s.launchInstaller,
    })),
  );

  if (!update) return null;

  const renderContent = () => {
    switch (downloadStatus) {
      case "idle":
        return (
          <>
            <span>
              Labrynth <strong>v{update.latestVersion}</strong> is available
              <span className="opacity-60"> (current: v{update.currentVersion})</span>
            </span>
            <button
              onClick={startDownload}
              className="rounded border border-accent/40 px-2 py-0.5 font-medium hover:bg-accent/20 transition-colors"
            >
              Download v{update.latestVersion}
            </button>
          </>
        );

      case "downloading":
        return (
          <>
            <span>
              Downloading…{downloadPercent > 0 ? ` ${downloadPercent}%` : ""}
            </span>
            <div className="h-4 w-24 rounded-full bg-accent/20 overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
          </>
        );

      case "ready":
        return (
          <>
            <span>
              Labrynth <strong>v{update.latestVersion}</strong> is ready to install
              <span className="opacity-60"> (current: v{update.currentVersion})</span>
            </span>
            <button
              onClick={launchInstaller}
              className="rounded bg-green-600/80 hover:bg-green-600 px-3 py-0.5 font-medium transition-colors"
            >
              Install & Restart
            </button>
          </>
        );

      case "launching":
        return (
          <span>
            Launching installer… Please wait.
          </span>
        );

      case "error":
        return (
          <>
            <span className="text-red-400">
              Error: {downloadError}
            </span>
            <button
              onClick={startDownload}
              className="rounded border border-red-400/40 px-2 py-0.5 font-medium hover:bg-red-400/20 transition-colors text-red-400"
            >
              Retry
            </button>
          </>
        );
    }
  };

  return (
    <div className="relative z-20 flex items-center justify-center gap-3 bg-accent/10 px-4 py-2 text-sm text-accent border-b border-accent/20">
      {renderContent()}
      <button
        onClick={dismiss}
        disabled={downloadStatus !== "idle"}
        className="ml-2 opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Dismiss update notification"
      >
        &times;
      </button>
    </div>
  );
}
