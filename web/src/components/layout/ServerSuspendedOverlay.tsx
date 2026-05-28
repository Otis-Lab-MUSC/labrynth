import { useAppStore } from "../../store/useAppStore";

export function ServerSuspendedOverlay() {
  const serverSuspended = useAppStore((s) => s.serverSuspended);
  const hardKillIn = useAppStore((s) => s.hardKillIn);

  if (!serverSuspended) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-lg border border-theme-border bg-panel p-8 text-center max-w-md shadow-xl">
        <h2 className="text-xl font-bold text-accent mb-2">Session Timed Out</h2>
        <p className="text-sm text-theme-text-secondary mb-2">
          The server entered a suspended state after no client was connected for an extended period.
          Session data has been preserved.
        </p>
        {hardKillIn != null && (
          <p className="text-xs text-red-400 mb-4">
            Server process will terminate in ~{Math.round(hardKillIn / 60)} minutes if not reconnected.
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
        >
          Reconnect
        </button>
      </div>
    </div>
  );
}
