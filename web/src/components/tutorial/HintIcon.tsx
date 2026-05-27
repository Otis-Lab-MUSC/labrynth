import { useState } from "react";
import { Info } from "lucide-react";
import { useTutorialStore } from "../../store/useTutorialStore";

interface HintIconProps {
  hint: string;
  helpSection?: string;
  placement?: "top" | "bottom";
  className?: string;
}

export function HintIcon({ hint, helpSection, placement = "top", className }: HintIconProps) {
  const [open, setOpen] = useState(false);
  const setHelpSection = useTutorialStore((s) => s.setHelpSection);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (helpSection) setHelpSection(helpSection);
  };

  const popoverPos =
    placement === "bottom"
      ? "top-full mt-2"
      : "bottom-full mb-2";

  return (
    <span className={`relative inline-flex items-center ml-1 ${className ?? ""}`}>
      <button
        type="button"
        aria-label="More information"
        className="text-theme-text/30 hover:text-theme-text/70 transition-colors focus:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={handleClick}
      >
        <Info size={14} />
      </button>

      {open && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 ${popoverPos} z-[40] w-48 rounded border border-theme-border bg-panel px-2.5 py-2 text-xs text-theme-text/80 leading-relaxed shadow-lg pointer-events-none animate-tooltip-enter`}
        >
          {hint}
          {helpSection && (
            <span className="block mt-1 text-accent/60 text-[10px]">Click for more →</span>
          )}
        </div>
      )}
    </span>
  );
}
