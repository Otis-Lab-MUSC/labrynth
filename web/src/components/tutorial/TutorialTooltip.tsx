import { useEffect, useRef, useLayoutEffect, useState } from "react";
import { TutorialProgress } from "./TutorialProgress";
import type { TutorialStep } from "../../store/useTutorialStore";

interface TutorialTooltipProps {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  rect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const TOOLTIP_WIDTH = 340;
const VIEWPORT_MARGIN = 8;

type Placement = TutorialStep["placement"];

function computeIdealPosition(
  placement: Placement,
  rect: DOMRect,
  tooltipHeight: number,
): { top: number; left: number; resolvedPlacement: Placement } {
  const padding = 16;

  // Try the requested placement, flip if it would escape viewport
  let resolved = placement;

  if (resolved === "bottom" && rect.bottom + padding + tooltipHeight > window.innerHeight) {
    resolved = "top";
  } else if (resolved === "top" && rect.top - padding - tooltipHeight < 0) {
    resolved = "bottom";
  } else if (resolved === "right" && rect.right + padding + TOOLTIP_WIDTH > window.innerWidth) {
    resolved = "left";
  } else if (resolved === "left" && rect.left - padding - TOOLTIP_WIDTH < 0) {
    resolved = "right";
  }

  let top: number;
  let left: number;

  switch (resolved) {
    case "bottom":
      top = rect.bottom + padding;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "top":
      top = rect.top - padding - tooltipHeight;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + padding;
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - padding - TOOLTIP_WIDTH;
      break;
    default:
      top = rect.bottom + padding;
      left = rect.left;
      break;
  }

  return { top, left, resolvedPlacement: resolved };
}

function clamp(top: number, left: number, tooltipHeight: number): { top: number; left: number } {
  return {
    top: Math.min(Math.max(top, VIEWPORT_MARGIN), window.innerHeight - tooltipHeight - VIEWPORT_MARGIN),
    left: Math.min(Math.max(left, VIEWPORT_MARGIN), window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN),
  };
}

export function TutorialTooltip({
  step,
  stepIndex,
  totalSteps,
  rect,
  onNext,
  onPrev,
  onSkip,
}: TutorialTooltipProps) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(180);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrev, onSkip]);

  // Measure actual tooltip height after render and reposition if needed
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const h = tooltipRef.current.getBoundingClientRect().height;
      if (Math.abs(h - measuredHeight) > 2) {
        setMeasuredHeight(h);
      }
    }
  });

  let positionStyle: React.CSSProperties;

  if (!rect || step.placement === "center") {
    positionStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  } else {
    const { top, left } = clamp(
      ...(() => {
        const ideal = computeIdealPosition(step.placement, rect, measuredHeight);
        return [ideal.top, ideal.left] as [number, number];
      })(),
      measuredHeight,
    );
    positionStyle = {
      position: "fixed",
      top,
      left,
    };
  }

  return (
    <div
      ref={tooltipRef}
      className="z-[70] w-[340px] bg-panel border border-theme-border rounded-lg shadow-xl animate-tooltip-enter overflow-hidden"
      style={positionStyle}
    >
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-accent">{step.title}</h3>
          <p className="mt-1 text-sm text-theme-text/80 leading-relaxed">{step.content}</p>
        </div>

        <TutorialProgress current={stepIndex} total={totalSteps} />

        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-[10px] text-theme-text/30 hover:text-theme-text/60 transition"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={onPrev}
                className="px-3 py-1 text-xs rounded border border-theme-border text-theme-text/70 hover:bg-accent/10 transition"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="px-3 py-1 text-xs rounded bg-accent text-accent-contrast hover:bg-accent-hover transition"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
