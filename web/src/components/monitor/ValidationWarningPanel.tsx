import type { ValidationWarning } from "../../api/client";

interface Props {
  warnings: ValidationWarning[];
  suggestions: string;
  onDismiss: () => void;
  onProceed: () => void;
}

export function ValidationWarningPanel({ warnings, suggestions, onDismiss, onProceed }: Props) {
  const errorCount = warnings.filter((w) => w.severity === "error").length;
  const warnCount = warnings.filter((w) => w.severity === "warning").length;

  const label =
    errorCount > 0
      ? `${errorCount} error${errorCount > 1 ? "s" : ""}${warnCount > 0 ? `, ${warnCount} warning${warnCount > 1 ? "s" : ""}` : ""}`
      : `${warnCount} warning${warnCount > 1 ? "s" : ""}`;

  return (
    <div className="rounded border border-yellow-500/50 bg-yellow-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-yellow-400">AI Config Review — {label} found</span>
      </div>

      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${
                w.severity === "error"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {w.severity}
            </span>
            <span className="text-theme-text/80">
              {w.field && <span className="font-mono text-theme-text/50">{w.field}: </span>}
              {w.message}
            </span>
          </li>
        ))}
      </ul>

      {suggestions && (
        <p className="text-xs italic text-theme-text/50">{suggestions}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onDismiss}
          className="rounded border border-theme-border px-3 py-1.5 text-sm text-theme-text font-mono hover:bg-accent/10"
        >
          Dismiss
        </button>
        <button
          onClick={onProceed}
          className="rounded border border-yellow-500/50 px-3 py-1.5 text-sm text-yellow-400 font-mono hover:bg-yellow-500/10"
        >
          Acknowledge and Start Anyway
        </button>
      </div>
    </div>
  );
}
