import { useTutorialStore } from "../../store/useTutorialStore";

export function DemoModeBanner() {
  const demoMode = useTutorialStore((s) => s.demoMode);
  const setDemoMode = useTutorialStore((s) => s.setDemoMode);

  if (!demoMode) return null;

  return (
    <div className="relative z-10 flex items-center justify-center gap-3 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-400">
      <span className="font-medium">Demo Mode</span>
      <span className="text-amber-400/60">— No hardware connected.</span>
      <button
        onClick={() => setDemoMode(false)}
        className="ml-2 rounded px-2 py-0.5 text-[10px] font-medium border border-amber-500/30 hover:bg-amber-500/20 transition"
      >
        Exit Demo
      </button>
    </div>
  );
}
