import { HelpCircle } from "lucide-react";
import { useTutorialStore } from "../../store/useTutorialStore";

export function HelpButton() {
  const helpOpen = useTutorialStore((s) => s.helpOpen);
  const setHelpOpen = useTutorialStore((s) => s.setHelpOpen);

  return (
    <button
      onClick={() => setHelpOpen(!helpOpen)}
      className="rounded p-1.5 hover:bg-accent/10 text-theme-text"
      title="Help"
    >
      <HelpCircle size={18} />
    </button>
  );
}
