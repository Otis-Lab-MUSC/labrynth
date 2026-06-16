import type { Session } from "../../types";

interface Props {
  session: Session;
  elapsed: number;
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ProgressBar({ label, pct, display }: { label: string; pct: number; display: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-theme-text/60 uppercase text-xs tracking-wider">{label}</span>
        <span className="text-accent font-bold tabular-nums text-xs">{display}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-black/60 border border-theme-border/60">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SessionProgress({ session, elapsed }: Props) {
  const limits = session.limitSettings;
  if (!limits) return null;
  if (session.state !== "running" && session.state !== "paused" && session.state !== "stopped") return null;

  const showTime = limits.limitType === "Time" || limits.limitType === "Both";
  const showCount = limits.limitType === "Infusion" || limits.limitType === "Both" || limits.limitType === "Trials";
  const isTrials = limits.limitType === "Trials";

  if (!showTime && !showCount) return null;

  const timePct = showTime ? Math.min(elapsed / limits.timeLimit, 1) * 100 : 0;
  const currentCount = isTrials ? session.trialCount : session.infusionCount;
  const countPct = showCount ? Math.min(currentCount / limits.infusionLimit, 1) * 100 : 0;
  const countLabel = isTrials ? "TRIALS" : "INFUSIONS";

  return (
    <div className="rounded-lg border border-theme-border/70 bg-panel p-4 font-mono text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent text-xs uppercase tracking-wider font-bold">Session Progress</span>
        <div className="flex-1 border-b border-dashed border-theme-border" />
      </div>
      <div className="space-y-3">
        {showTime && <ProgressBar label="TIME" pct={timePct} display={`${fmtTime(elapsed)} / ${fmtTime(limits.timeLimit)}`} />}
        {showCount && <ProgressBar label={countLabel} pct={countPct} display={`${currentCount} / ${limits.infusionLimit}`} />}
      </div>
    </div>
  );
}
