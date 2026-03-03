interface TutorialProgressProps {
  current: number;
  total: number;
}

export function TutorialProgress({ current, total }: TutorialProgressProps) {
  if (total > 10) {
    const pct = ((current + 1) / total) * 100;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-theme-text/50 whitespace-nowrap">
          {current + 1} / {total}
        </span>
        <div className="h-1 flex-1 min-w-[40px] max-w-[80px] bg-theme-text/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-200 ${
            i === current
              ? "w-4 bg-accent"
              : i < current
                ? "w-1.5 bg-accent/50"
                : "w-1.5 bg-theme-text/20"
          }`}
        />
      ))}
    </div>
  );
}
