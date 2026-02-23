import { useSessionStore } from "../../store/useSessionStore";

interface SessionNotesProps {
  sessionId: string;
  notes: string;
}

export function SessionNotes({ sessionId, notes }: SessionNotesProps) {
  const setSessionNotes = useSessionStore((s) => s.setSessionNotes);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">Session Notes</h3>
      <textarea
        value={notes}
        onChange={(e) => setSessionNotes(sessionId, e.target.value)}
        placeholder="Enter session notes..."
        className="input-base w-full min-h-[100px] resize-y"
        rows={4}
      />
      <p className="text-xs text-theme-text/40 font-mono">
        Optional notes about this session. Included in ZIP export.
      </p>
    </div>
  );
}
