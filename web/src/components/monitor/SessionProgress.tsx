import { useEffect, useRef, useState } from "react";
import type { Session } from "../../types";
import { SHOCK_ANIM_MS, countShocks, shouldJolt } from "../../lib/shockEvents.ts";

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

/** Rendered mouse width in px; the bar geometry is derived from it. */
const MOUSE_W = 44;

/** Hip positions (x) and phase offsets for the four legs: diagonal pairs move together. */
const MOUSE_LEGS = [
  { x: 11.5, delay: "0s" },
  { x: 15.5, delay: "-0.16s" },
  { x: 24.5, delay: "-0.16s" },
  { x: 28.5, delay: "0s" },
] as const;

/** Side-on mouse facing right. Legs swing and the body bobs only while `running`;
 *  paused / stopped leave it standing still. A delivered shock launches it into a
 *  splayed, spiky pose that jumps and flashes for SHOCK_ANIM_MS. */
function ProgressMouse({ running, shocked }: { running: boolean; shocked: boolean }) {
  const legClass = running && !shocked ? "animate-mouse-leg motion-reduce:animate-none" : "";
  const body = (
    <>
      {/* Legs sit behind the body so the hips are hidden */}
      {MOUSE_LEGS.map((leg) => (
        <line
          key={leg.x}
          x1={leg.x}
          y1="14"
          x2={shocked ? leg.x + (leg.x < 20 ? -4 : 4) : leg.x}
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
        <path
          d={shocked ? "M8 12 L5.5 10 L7.5 8 L5 6 L7 4 L5.5 1.5" : "M8 12 C3 12.5 1.5 7 5 4.5"}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
        {/* Body + tapered head */}
        <path
          d="M7.5 12.5 C7.5 8 14 5.5 21 6 C26 6.3 30 7.6 33 9.6 L38.2 11.6 C38.9 11.9 38.9 12.7 38.2 13 L33 14.4 C32 14.8 31 15 30 15 L10.5 15 C8.8 15 7.5 14 7.5 12.5 Z"
          fill="currentColor"
          opacity="0.9"
        />
        {shocked && (
          <g fill="currentColor" opacity="0.9">
            <polygon points="10.1,8.8 11,5.8 11.9,8.8" />
            <polygon points="13.3,7.2 14.5,4.2 15.7,7.2" />
            <polygon points="24.8,7.4 26,4.4 27.2,7.4" />
            <polygon points="29.6,9 30.5,6 31.4,9" />
          </g>
        )}
        {/* Ear */}
        <circle cx="27.5" cy="6.4" r="3" fill="currentColor" opacity="0.6" />
        <circle cx="27.5" cy="6.4" r="1.5" fill="rgb(var(--color-surface))" opacity="0.55" />
        {/* Eye + nose */}
        <circle cx="32" cy="10.3" r={shocked ? 1.4 : 0.9} fill="rgb(var(--color-surface))" />
        <circle cx="38.3" cy="12.1" r="0.9" fill="rgb(var(--color-surface))" opacity="0.8" />
        {/* Whiskers */}
        <line x1="35.5" y1="12.2" x2="41" y2="10.6" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
        <line x1="35.5" y1="12.9" x2="41" y2="13.6" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
        {shocked && <ellipse cx="36.4" cy="13.3" rx="0.9" ry="0.6" fill="#1c1917" />}
      </g>
    </>
  );
  return (
    <svg
      viewBox="0 0 42 22"
      width={MOUSE_W}
      height="23"
      fill="none"
      overflow={shocked ? "visible" : undefined}
      role="img"
      aria-label={shocked ? "Shock delivered" : running ? "Session running" : "Session not running"}
      className="block text-accent drop-shadow-[0_0_3px_rgb(var(--color-accent)/0.55)]"
    >
      {shocked ? (
        <g className="animate-mouse-shock motion-reduce:animate-none" style={{ transformBox: "fill-box" }}>
          <g className="animate-mouse-flash motion-reduce:animate-none">{body}</g>
          {/* Spark above the back */}
          <g stroke="#ff2d2d" strokeWidth="1" strokeLinecap="round">
            <line x1="18" y1="4" x2="17" y2="1" />
            <line x1="21" y1="3.5" x2="21" y2="0.5" />
            <line x1="24" y1="4" x2="25" y2="1" />
          </g>
        </g>
      ) : (
        body
      )}
    </svg>
  );
}

/** Cheese wedge: the goal at the end of the track. Lights up once the bar is full. */
function ProgressCheese({ reached }: { reached: boolean }) {
  return (
    <svg
      viewBox="0 0 24 22"
      width="26"
      height="24"
      fill="none"
      role="img"
      aria-label={reached ? "Goal reached" : "Goal"}
      className={`block shrink-0 transition-all duration-300 ${
        reached ? "drop-shadow-[0_0_5px_rgb(250_204_21/0.7)]" : "opacity-80"
      }`}
    >
      {/* Wedge, front-left face + top face */}
      <path d="M2 17 L20 17 L20 11 C14 10.5 7 8 2 4 Z" fill="#facc15" stroke="#a16207" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M2 4 L8 1.5 L22 6.5 L20 11 C14 10.5 7 8 2 4 Z" fill="#fde047" stroke="#a16207" strokeWidth="1.1" strokeLinejoin="round" />
      {/* Holes */}
      <circle cx="9" cy="13.5" r="1.7" fill="#a16207" opacity="0.8" />
      <circle cx="15.5" cy="14.2" r="1.1" fill="#a16207" opacity="0.8" />
      <circle cx="14" cy="6.6" r="1" fill="#a16207" opacity="0.7" />
    </svg>
  );
}

function ProgressBar({
  label,
  pct,
  display,
  running,
  shocked,
}: {
  label: string;
  pct: number;
  display: string;
  running: boolean;
  shocked: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-theme-text/60 uppercase text-xs tracking-wider">{label}</span>
        <span className="text-accent font-bold tabular-nums text-xs">{display}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* The mouse lives inside the track: it starts at the left edge and its travel is
            the track width minus its own width, so it reaches the right edge at 100%. */}
        {/* Not clipped, so the mouse can jump above the track; the fill clips itself. */}
        <div className="relative h-8 flex-1 overflow-visible rounded-full bg-black/60 border border-theme-border/60">
          {/* Fill sits behind the mouse and ends at its midpoint. Kept faint (accent/25) so the
              opaque mouse and its glow stay the brightest thing on the bar. */}
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent/25 transition-all duration-300"
              style={{ width: `calc(${MOUSE_W / 2}px + (100% - ${MOUSE_W}px) * ${pct / 100})` }}
            />
          </div>
          <div
            className="absolute inset-y-0 flex items-center transition-all duration-300"
            style={{ left: `calc((100% - ${MOUSE_W}px) * ${pct / 100})` }}
          >
            <ProgressMouse running={running} shocked={shocked} />
          </div>
        </div>
        <ProgressCheese reached={pct >= 100} />
      </div>
    </div>
  );
}

export function SessionProgress({ session, elapsed }: Props) {
  const shocks = countShocks(session.behaviorData);
  const running = session.state === "running";
  const seenShocks = useRef(shocks);
  const [shocked, setShocked] = useState(false);

  useEffect(() => {
    // A segment split lowers the count; only a small rise is a live shock.
    if (shouldJolt(seenShocks.current, shocks, running)) setShocked(true);
    seenShocks.current = shocks;
  }, [shocks, running]);

  useEffect(() => {
    if (!shocked) return;
    const t = setTimeout(() => setShocked(false), SHOCK_ANIM_MS);
    return () => clearTimeout(t);
  }, [shocked]);

  const limits = session.limitSettings;
  if (!limits) return null;
  if (session.state !== "running" && session.state !== "paused" && session.state !== "stopped") return null;

  const showTime = limits.limitType === "Time" || limits.limitType === "Both";
  const showCount = limits.limitType === "Infusion" || limits.limitType === "Both" || limits.limitType === "Trials";
  const isTrials = limits.limitType === "Trials";

  if (!showTime && !showCount) return null;

  const timePct = showTime ? Math.min(elapsed / limits.timeLimit, 1) * 100 : 0;
  // The server stops on its own whole-session count, so the bar tracks that rather than the
  // local segment count (which can include pumps the limit does not count).
  const currentCount = isTrials ? session.trialCount : (session.serverInfusionCount ?? session.cumulativeInfusionCount + session.infusionCount);
  const countPct = showCount ? Math.min(currentCount / limits.infusionLimit, 1) * 100 : 0;
  const countLabel = isTrials ? "TRIALS" : "INFUSIONS";

  return (
    <div className="rounded-lg border border-theme-border/70 bg-panel p-4 font-mono text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent text-xs uppercase tracking-wider font-bold">Session Progress</span>
        <div className="flex-1 border-b border-dashed border-theme-border" />
      </div>
      <div className="space-y-3">
        {showTime && <ProgressBar label="TIME" pct={timePct} display={`${fmtTime(elapsed)} / ${fmtTime(limits.timeLimit)}`} running={running} shocked={shocked} />}
        {showCount && <ProgressBar label={countLabel} pct={countPct} display={`${currentCount} / ${limits.infusionLimit}`} running={running} shocked={shocked} />}
      </div>
    </div>
  );
}
