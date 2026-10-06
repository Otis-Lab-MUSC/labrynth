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

/** Hip positions (x) and phase offsets for the four legs: diagonal pairs move together. */
const MOUSE_LEGS = [
  { x: 11.5, delay: "0s" },
  { x: 15.5, delay: "-0.16s" },
  { x: 24.5, delay: "-0.16s" },
  { x: 28.5, delay: "0s" },
] as const;

/** Side-on mouse facing right. Legs swing and the body bobs only while `running`;
 *  paused / stopped leave it standing still. */
function ProgressMouse({ running }: { running: boolean }) {
  const legClass = running ? "animate-mouse-leg motion-reduce:animate-none" : "";
  return (
    <svg
      viewBox="0 0 42 22"
      width="26"
      height="14"
      fill="none"
      role="img"
      aria-label={running ? "Session running" : "Session not running"}
      className="block text-accent drop-shadow-[0_0_3px_rgb(var(--color-accent)/0.55)]"
    >
      {/* Legs sit behind the body so the hips are hidden */}
      {MOUSE_LEGS.map((leg) => (
        <line
          key={leg.x}
          x1={leg.x}
          y1="14"
          x2={leg.x}
          y2="20"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.75"
          className={legClass}
          style={{ transformBox: "fill-box", transformOrigin: "50% 0%", animationDelay: leg.delay }}
        />
      ))}
      <g className={running ? "animate-mouse-bob motion-reduce:animate-none" : ""}>
        {/* Tail */}
        <path d="M8 12 C3 12.5 1.5 7 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
        {/* Body + tapered head */}
        <path
          d="M7.5 12.5 C7.5 8 14 5.5 21 6 C26 6.3 30 7.6 33 9.6 L38.2 11.6 C38.9 11.9 38.9 12.7 38.2 13 L33 14.4 C32 14.8 31 15 30 15 L10.5 15 C8.8 15 7.5 14 7.5 12.5 Z"
          fill="currentColor"
          opacity="0.9"
        />
        {/* Ear */}
        <circle cx="27.5" cy="6.4" r="3" fill="currentColor" opacity="0.6" />
        <circle cx="27.5" cy="6.4" r="1.5" fill="rgb(var(--color-surface))" opacity="0.55" />
        {/* Eye + nose */}
        <circle cx="32" cy="10.3" r="0.9" fill="rgb(var(--color-surface))" />
        <circle cx="38.3" cy="12.1" r="0.9" fill="rgb(var(--color-surface))" opacity="0.8" />
        {/* Whiskers */}
        <line x1="35.5" y1="12.2" x2="41" y2="10.6" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
        <line x1="35.5" y1="12.9" x2="41" y2="13.6" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
      </g>
    </svg>
  );
}

function ProgressBar({
  label,
  pct,
  display,
  running,
  showMouse,
}: {
  label: string;
  pct: number;
  display: string;
  running: boolean;
  showMouse: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-theme-text/60 uppercase text-xs tracking-wider">{label}</span>
        <span className="text-accent font-bold tabular-nums text-xs">{display}</span>
      </div>
      <div className="relative h-5 w-full rounded-full bg-black/60 border border-theme-border/60">
        <div
          className="h-full rounded-full bg-accent/40 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
        {showMouse && (
          <div
            className="absolute inset-y-0 flex items-center transition-all duration-300"
            style={{ left: `${pct}%`, transform: "translateX(-100%)" }}
          >
            <ProgressMouse running={running} />
          </div>
        )}
      </div>
    </div>
  );
}

export function SessionProgress({ session, elapsed }: Props) {
  const limits = session.limitSettings;
  if (!limits) return null;
  if (session.state !== "running" && session.state !== "paused" && session.state !== "stopped") return null;

  const running = session.state === "running";
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
        {showTime && <ProgressBar label="TIME" pct={timePct} display={`${fmtTime(elapsed)} / ${fmtTime(limits.timeLimit)}`} running={running} showMouse />}
        {showCount && <ProgressBar label={countLabel} pct={countPct} display={`${currentCount} / ${limits.infusionLimit}`} running={running} showMouse={!showTime} />}
      </div>
    </div>
  );
}
