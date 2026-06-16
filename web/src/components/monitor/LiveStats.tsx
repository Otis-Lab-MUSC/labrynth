import type { Session, LeverCounts } from "../../types";

interface Props {
  session: Session;
}

interface ParadigmStatsConfig {
  pressTypes: ("ACTIVE" | "TIMEOUT" | "INACTIVE")[];
  hasTrials: boolean;
  showLeverStats: boolean;
}

const PARADIGM_CONFIG: Record<string, ParadigmStatsConfig> = {
  fr:        { pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"], hasTrials: false, showLeverStats: true  },
  vi:        { pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"], hasTrials: false, showLeverStats: true  },
  pr:        { pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"], hasTrials: false, showLeverStats: true  },
  pavlovian: { pressTypes: ["ACTIVE", "INACTIVE"],            hasTrials: true,  showLeverStats: false },
  omission:  { pressTypes: ["ACTIVE", "INACTIVE"],            hasTrials: false, showLeverStats: true  },
};

const DEFAULT_CONFIG: ParadigmStatsConfig = {
  pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"],
  hasTrials: false,
  showLeverStats: true,
};

const PRESS_KEY: Record<string, keyof LeverCounts> = {
  ACTIVE: "active",
  TIMEOUT: "timeout",
  INACTIVE: "inactive",
};

function leverTotal(counts: LeverCounts): number {
  return counts.active + counts.timeout + counts.inactive;
}

export function LiveStats({ session }: Props) {
  const config: ParadigmStatsConfig =
    (session.paradigm ? PARADIGM_CONFIG[session.paradigm] : undefined) ?? DEFAULT_CONFIG;

  const lickCount = session.behaviorData.filter(
    (e) => e.device === "LICK" && e.event === "LICK"
  ).length;

  const sessionStats: { label: string; value: string | number }[] = [
    { label: "INFUSIONS", value: session.infusionCount },
    { label: "LICKS", value: lickCount },
    ...(config.hasTrials
      ? [
          { label: "TRIALS", value: session.trialCount },
          { label: "CS+", value: session.csPlusCount },
          { label: "CS-", value: session.csMinusCount },
        ]
      : []),
    { label: "FRAMES", value: session.frameData.length },
  ];

  return (
    <div className="rounded-lg border border-theme-border bg-panel p-4 font-mono text-sm">
      {/* Lever Activity Section — only for lever-based paradigms and when a lever is armed */}
      {config.showLeverStats && (session.hardwareUi.rhLever.armed || session.hardwareUi.lhLever.armed) && (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-accent text-xs uppercase tracking-wider font-bold">Lever Activity</span>
          <div className="flex-1 border-b border-dashed border-theme-border" />
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-theme-text/60 text-xs uppercase tracking-wider">
              <th className="text-left py-1 pr-4 font-normal w-16" />
              {config.pressTypes.map((type) => (
                <th key={type} className="text-right py-1 px-3 font-normal">{type}</th>
              ))}
              <th className="text-right py-1 pl-3 font-normal">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {(["RH", "LH"] as const).map((lever) => {
              const counts = lever === "RH" ? session.rhLeverCounts : session.lhLeverCounts;
              return (
                <tr key={lever} className="border-t border-theme-border/50">
                  <td className="text-theme-text/60 text-xs uppercase tracking-wider py-1 pr-4">{lever}</td>
                  {config.pressTypes.map((type) => (
                    <td key={type} className="text-right text-accent font-bold tabular-nums py-1 px-3">
                      {counts[PRESS_KEY[type]]}
                    </td>
                  ))}
                  <td className="text-right text-accent font-bold tabular-nums py-1 pl-3">
                    {leverTotal(counts)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Session Section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-accent text-xs uppercase tracking-wider font-bold">
            {session.segmentNumber > 0 ? `Segment ${session.segmentNumber + 1}` : "Session"}
          </span>
          <div className="flex-1 border-b border-dashed border-theme-border" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sessionStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-md border border-theme-border/60 bg-theme-bg/50 px-3 py-2.5 flex flex-col shadow-sm"
            >
              <span className="text-theme-text/50 text-[10px] uppercase tracking-widest">
                {stat.label}
              </span>
              <span className="text-accent font-bold text-lg tabular-nums leading-tight mt-0.5">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cumulative Section — shown when segments have been split */}
      {session.segmentNumber > 0 && (
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-accent text-xs uppercase tracking-wider font-bold">Cumulative</span>
          <div className="flex-1 border-b border-dashed border-theme-border" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "SEGMENTS", value: session.segmentNumber + 1 },
            { label: "TOTAL INF.", value: session.cumulativeInfusionCount + session.infusionCount },
            ...(config.showLeverStats ? [{ label: "TOTAL PRESSES", value:
                session.cumulativeRhLeverCounts.active + session.cumulativeRhLeverCounts.timeout + session.cumulativeRhLeverCounts.inactive
              + session.cumulativeLhLeverCounts.active + session.cumulativeLhLeverCounts.timeout + session.cumulativeLhLeverCounts.inactive
              + leverTotal(session.rhLeverCounts) + leverTotal(session.lhLeverCounts)
            }] : []),
            ...(config.hasTrials
              ? [
                  { label: "TOTAL TRIALS", value: session.cumulativeTrialCount + session.trialCount },
                  { label: "TOTAL CS+", value: session.cumulativeCsPlusCount + session.csPlusCount },
                  { label: "TOTAL CS-", value: session.cumulativeCsMinusCount + session.csMinusCount },
                ]
              : []),
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-md border border-theme-border/60 bg-theme-bg/50 px-3 py-2.5 flex flex-col shadow-sm"
            >
              <span className="text-theme-text/50 text-[10px] uppercase tracking-widest">
                {stat.label}
              </span>
              <span className="text-accent font-bold text-lg tabular-nums leading-tight mt-0.5">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
