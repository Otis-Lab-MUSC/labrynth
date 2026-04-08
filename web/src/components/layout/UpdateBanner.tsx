import { useUpdateCheck } from "../../hooks/useUpdateCheck";

export function UpdateBanner() {
  const { update, dismiss } = useUpdateCheck();
  if (!update) return null;

  return (
    <div className="relative z-20 flex items-center justify-center gap-3 bg-accent/10 px-4 py-2 text-sm text-accent border-b border-accent/20">
      <span>
        Labrynth <strong>v{update.latestVersion}</strong> is available
        <span className="opacity-60"> (current: v{update.currentVersion})</span>
      </span>
      <a
        href={update.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded border border-accent/40 px-2 py-0.5 font-medium hover:bg-accent/20 transition-colors"
      >
        Download
      </a>
      <button
        onClick={dismiss}
        className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Dismiss update notification"
      >
        &times;
      </button>
    </div>
  );
}
