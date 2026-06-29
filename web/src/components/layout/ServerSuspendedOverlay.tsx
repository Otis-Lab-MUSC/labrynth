import { useAppStore } from "../../store/useAppStore";
import { useSessionStore } from "../../store/useSessionStore";
import { triggerAutoExport } from "../../hooks/useSessionWebSockets";

export function ServerSuspendedOverlay() {
  const serverSuspended = useAppStore((s) => s.serverSuspended);
  const hardKillIn = useAppStore((s) => s.hardKillIn);
  const appClosing = useAppStore((s) => s.appClosing);
  const hasActiveSession = useSessionStore(
    (s) => [...s.sessions.values()].some(
      (sess) => sess.state === "connected" || sess.state === "running" || sess.state === "paused"
    )
  );
  const sessionIdWithData = useSessionStore((s) => {
    for (const [id, sess] of s.sessions) {
      if ((sess.behaviorData?.length ?? 0) > 0 && !sess.exportState?.result && !sess.exportState?.exporting) return id;
    }
    return null;
  });

  if (!serverSuspended) return null;

  const headline = appClosing ? "Application Closing" : "Session Timed Out";
  const body = appClosing
    ? "No activity was detected for 60 minutes. The server process is shutting down."
    : "The server entered a suspended state after no client was connected for an extended period. Session data has been preserved.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-lg border border-theme-border bg-panel p-8 text-center max-w-md shadow-xl">
        <h2 className="text-xl font-bold text-accent mb-2">{headline}</h2>
        <p className="text-sm text-theme-text-secondary mb-2">{body}</p>
        {hardKillIn != null && !appClosing && (
          <p className="text-xs text-red-400 mb-4">
            Server process will terminate in ~{Math.round(hardKillIn / 60)} minutes if not reconnected.
          </p>
        )}
        {!appClosing && (
          hasActiveSession ? (
            <p className="text-xs text-yellow-400 mt-2">
              An active session is running — reloading will discard session data.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 mt-4">
              {sessionIdWithData && (
                <button
                  onClick={() => triggerAutoExport(sessionIdWithData)}
                  className="rounded bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
                >
                  Export Session Data
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
              >
                Reconnect
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
