import { useMemo } from "react";
import type { TutorialStep } from "../../store/useTutorialStore";

interface TutorialProgressProps {
  current: number;
  total: number;
  steps: TutorialStep[];
  onGoToStep: (index: number) => void;
}

interface SectionInfo {
  section: string;
  startIndex: number;
  count: number;
}

export function TutorialProgress({ current, total, steps, onGoToStep }: TutorialProgressProps) {
  const sections = useMemo(() => {
    const result: SectionInfo[] = [];
    for (let i = 0; i < steps.length; i++) {
      const label = steps[i].section ?? "Other";
      const last = result[result.length - 1];
      if (last && last.section === label) {
        last.count++;
      } else {
        result.push({ section: label, startIndex: i, count: 1 });
      }
    }
    return result;
  }, [steps]);

  const activeSectionIndex = sections.findIndex(
    (s) => current >= s.startIndex && current < s.startIndex + s.count,
  );

  const pct = ((current + 1) / total) * 100;

  return (
    <div className="space-y-2">
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {sections.map((s, i) => {
            const isActive = i === activeSectionIndex;
            const isPast = i < activeSectionIndex;
            return (
              <button
                key={s.section}
                onClick={() => onGoToStep(s.startIndex)}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                  isActive
                    ? "bg-amber-500/20 text-amber-400"
                    : isPast
                      ? "text-amber-500/50 hover:bg-amber-500/10"
                      : "text-theme-text/30 hover:bg-theme-text/5"
                }`}
              >
                {s.section}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-theme-text/50 whitespace-nowrap">
          {current + 1} / {total}
        </span>
        <div className="h-1 flex-1 min-w-[40px] max-w-[80px] bg-theme-text/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
