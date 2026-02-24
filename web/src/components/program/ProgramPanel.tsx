import { useSessionStore } from "../../store/useSessionStore";
import { ParadigmSettings } from "./ParadigmSettings";
import { PavlovianSettings } from "./PavlovianSettings";
import { LimitConfig } from "./LimitConfig";

export function ProgramPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const session = useSessionStore((s) =>
    s.activeSessionId ? s.sessions.get(s.activeSessionId) : null
  );

  if (!activeSessionId || !session) {
    return <p className="text-theme-text/60 font-mono">No active session.</p>;
  }

  const paradigm = session.paradigm?.toLowerCase();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-theme-text">Program Configuration</h2>

      {paradigm === "pavlovian" ? (
        <PavlovianSettings key={activeSessionId} sessionId={activeSessionId} />
      ) : (
        <ParadigmSettings key={activeSessionId} sessionId={activeSessionId} paradigm={paradigm ?? "fr"} />
      )}

      <LimitConfig key={activeSessionId} sessionId={activeSessionId} paradigm={paradigm} />
    </div>
  );
}
