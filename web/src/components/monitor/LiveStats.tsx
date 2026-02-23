import type { Session, LeverCounts } from "../../types";

interface Props {
  session: Session;
  elapsed: number;
}

interface ParadigmStatsConfig {
  pressTypes: ("ACTIVE" | "TIMEOUT" | "INACTIVE")[];
  hasTrials: boolean;
}

const PARADIGM_CONFIG: Record<string, ParadigmStatsConfig> = {
  fr:        { pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"], hasTrials: false },
  vi:        { pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"], hasTrials: false },
  pr:        { pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"], hasTrials: false },
  pavlovian: { pressTypes: ["ACTIVE", "INACTIVE"],            hasTrials: true  },
  omission:  { pressTypes: ["ACTIVE", "INACTIVE"],            hasTrials: false },
};

const DEFAULT_CONFIG: ParadigmStatsConfig = {
  pressTypes: ["ACTIVE", "TIMEOUT", "INACTIVE"],
  hasTrials: false,
};

const PRESS_KEY: Record<string, keyof LeverCounts> = {
  ACTIVE: "active",
  TIMEOUT: "timeout",
  INACTIVE: "inactive",
};

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function leverTotal(counts: LeverCounts): number {
  return counts.active + counts.timeout + counts.inactive;
}

export function LiveStats({ session, elapsed }: Props) {
  const config: ParadigmStatsConfig =
    (session.paradigm ? PARADIGM_CONFIG[session.paradigm] : undefined) ?? DEFAULT_CONFIG;

  const lickCount = session.behaviorData.filter(
    (e) => e.device === "LICK" && e.event === "LICK"
  ).length;

  const sessionStats: { label: string; value: string | number }[] = [
    { label: "INFUSIONS", value: session.infusionCount },
    { label: "LICKS", value: lickCount },
    ...(config.hasTrials ? [{ label: "TRIALS", value: session.trialCount }] : []),
    { label: "FRAMES", value: session.frameData.length },
    { label: "ELAPSED", value: fmtTime(elapsed) },
  ];

  return (
    <div className="rounded-lg border border-theme-border bg-panel p-4 font-mono text-sm">
      {/* Lever Activity Section */}
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
                <tr key={lever} className="border-t border-theme-border/30">
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

      {/* Session Section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-accent text-xs uppercase tracking-wider font-bold">Session</span>
          <div className="flex-1 border-b border-dashed border-theme-border" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
          {sessionStats.map((stat) => (
            <div key={stat.label} className="flex justify-between items-baseline py-0.5">
              <span className="text-theme-text/60 uppercase text-xs tracking-wider">{stat.label}</span>
              <span className="text-accent font-bold tabular-nums ml-3">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
