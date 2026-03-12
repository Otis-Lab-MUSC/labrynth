import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTutorialStore } from "../../store/useTutorialStore";
import { useSessionStore } from "../../store/useSessionStore";
import { useThemeStore } from "../../store/useThemeStore";

const DISMISSED_KEY = "labrynth-welcome-dismissed";

function ReacherLogo() {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className="h-20 w-auto text-accent"
      role="img"
      aria-label="Labrynth logo"
    >
      <defs>
        <filter id="welcome-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="welcome-clip-left">
          <path d="M 12,50 C 12,38 14,28 18,22 C 22,16 27,12 33,10 C 38,8 43,8 47,10 L 47,92 C 43,92 38,90 33,86 C 27,82 22,74 18,66 C 14,58 12,54 12,50 Z" />
        </clipPath>
        <clipPath id="welcome-clip-right">
          <path d="M 88,50 C 88,38 86,28 82,22 C 78,16 73,12 67,10 C 62,8 57,8 53,10 L 53,92 C 57,92 62,90 67,86 C 73,82 78,74 82,66 C 86,58 88,54 88,50 Z" />
        </clipPath>
      </defs>
      <g filter="url(#welcome-glow)">
        <path
          d="M 47,10 C 43,8 38,8 33,10 C 28,12 23,16 19,22 C 15,28 13,36 12,44 C 11,52 12,58 15,64 C 18,70 22,76 27,81 C 32,86 37,89 42,91 C 44,92 46,92 47,92"
          stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
        />
        <path
          d="M 53,10 C 57,8 62,8 67,10 C 72,12 77,16 81,22 C 85,28 87,36 88,44 C 89,52 88,58 85,64 C 82,70 78,76 73,81 C 68,86 63,89 58,91 C 56,92 54,92 53,92"
          stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
        />
        <line x1="50" y1="10" x2="50" y2="92" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <g clipPath="url(#welcome-clip-left)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none">
          <polyline points="16,30 16,22 24,22 24,30" />
          <polyline points="20,16 30,16 30,24" />
          <polyline points="36,12 36,20 44,20 44,14" />
          <polyline points="16,36 24,36 24,44 16,44" />
          <polyline points="28,28 28,36 36,36 36,28 44,28" />
          <polyline points="38,36 44,36 44,44 38,44 38,52" />
          <polyline points="16,50 24,50 24,58 16,58" />
          <polyline points="28,44 28,52 20,52" />
          <polyline points="30,56 30,64 38,64 38,56 44,56" />
          <polyline points="16,64 24,64 24,72 16,72" />
          <polyline points="28,68 36,68 36,76 28,76 28,84" />
          <polyline points="36,80 44,80 44,72 44,64" />
        </g>
        <g clipPath="url(#welcome-clip-right)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none">
          <polyline points="84,30 84,22 76,22 76,30" />
          <polyline points="80,16 70,16 70,24" />
          <polyline points="64,12 64,20 56,20 56,14" />
          <polyline points="84,36 76,36 76,44 84,44" />
          <polyline points="72,28 72,36 64,36 64,28 56,28" />
          <polyline points="62,36 56,36 56,44 62,44 62,52" />
          <polyline points="84,50 76,50 76,58 84,58" />
          <polyline points="72,44 72,52 80,52" />
          <polyline points="70,56 70,64 62,64 62,56 56,56" />
          <polyline points="84,64 76,64 76,72 84,72" />
          <polyline points="72,68 64,68 64,76 72,76 72,84" />
          <polyline points="64,80 56,80 56,72 56,64" />
        </g>
      </g>
    </svg>
  );
}

const IS_DEMO_SITE = import.meta.env.VITE_DEMO_SITE === "true";

export function WelcomeScreen() {
  const completedTours = useTutorialStore((s) => s.completedTours);
  const startTour = useTutorialStore((s) => s.startTour);
  const setDemoMode = useTutorialStore((s) => s.setDemoMode);
  const sessionCount = useSessionStore((s) => s.sessionOrder.length);
  const isReacher = useThemeStore((s) => s.themeId) === "reacher";

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Demo site: ensure demo mode is active whenever the welcome screen is visible
  useEffect(() => {
    if (IS_DEMO_SITE) setDemoMode(true);
  }, [setDemoMode]);

  // Don't show if already dismissed, has completed tours, or has sessions
  const shouldShow = !dismissed && completedTours.length === 0 && sessionCount === 0;
  const [visible, setVisible] = useState(shouldShow);

  useEffect(() => {
    setVisible(shouldShow);
  }, [shouldShow]);

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
  };

  const handleTour = () => {
    dismiss();
    if (IS_DEMO_SITE) setDemoMode(true);
    startTour("first-session");
  };

  const handleDemo = () => {
    dismiss();
    setDemoMode(true);
  };

  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70">
      <div className="bg-panel border border-theme-border rounded-xl shadow-2xl w-full max-w-md m-4 p-8 text-center space-y-6 animate-tooltip-enter">
        <ReacherLogo />

        <div className="space-y-2">
          {isReacher && (
            <p className="text-xs tracking-widest uppercase text-theme-text/40" style={{ fontFamily: "var(--font-mono)" }}>
              v2.0.0 // LABRYNTH
            </p>
          )}
          <h1 className={`text-2xl font-bold text-accent ${isReacher ? "blink-cursor" : ""}`}>
            {IS_DEMO_SITE ? "Try Labrynth" : "Welcome to Labrynth"}
          </h1>
          <p className="text-sm text-theme-text/60 leading-relaxed">
            {IS_DEMO_SITE
              ? "Explore the full interface with simulated hardware — no device required."
              : "Take an interactive tour — you'll configure a real session as you learn each panel."}
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleTour}
            className="w-full rounded-lg bg-accent px-4 py-3 text-accent-contrast font-medium hover:bg-accent-hover transition"
          >
            Take the Interactive Tour
          </button>
          <button
            onClick={handleDemo}
            className="w-full rounded-lg border border-accent/30 px-4 py-3 text-accent font-medium hover:bg-accent/10 transition"
          >
            {IS_DEMO_SITE ? "Explore Freely" : "Try Demo Mode"}
          </button>
        </div>

        {!IS_DEMO_SITE && (
          <button
            onClick={dismiss}
            className="text-xs text-theme-text/30 hover:text-theme-text/60 transition"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
