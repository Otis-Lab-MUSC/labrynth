import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { NeuralBackground } from "./components/layout/NeuralBackground";
import { CTScanBackground } from "./components/layout/CTScanBackground";
import { StormSynapseBackground } from "./components/layout/StormSynapseBackground";
import { EmberCircuitBackground } from "./components/layout/EmberCircuitBackground";
import { NeonGridBackground } from "./components/layout/NeonGridBackground";
import { CyberpunkGridBackground } from "./components/layout/CyberpunkGridBackground";
import { CyberpunkCursor } from "./components/layout/CyberpunkCursor";
import { SessionPanel } from "./components/session/SessionPanel";
import { HardwarePanel } from "./components/hardware/HardwarePanel";
import { ProgramPanel } from "./components/program/ProgramPanel";
import { MonitorPanel } from "./components/monitor/MonitorPanel";
import { SessionStartModal } from "./components/monitor/SessionStartModal";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { DataExport } from "./components/data/DataExport";
import { TutorialOverlay } from "./components/tutorial/TutorialOverlay";
import { HelpPanel } from "./components/tutorial/HelpPanel";
import { WelcomeScreen } from "./components/tutorial/WelcomeScreen";
import { DemoModeBanner } from "./components/tutorial/DemoModeBanner";
import { useThemeStore } from "./store/useThemeStore";
import { useNavigationStore } from "./store/useNavigationStore";
import { useSessionWebSockets } from "./hooks/useSessionWebSockets";
import { useSessionRecovery } from "./hooks/useSessionRecovery";
import { useBeforeUnload } from "./hooks/useBeforeUnload";
import { useSingleTab } from "./hooks/useSingleTab";
import { useScrollReveal } from "./hooks/useScrollReveal";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import type { Panel } from "./store/useNavigationStore";

function BackgroundLayer() {
  const background = useThemeStore((s) => s.theme.background);
  return (
    <>
      {background === "neural" && <NeuralBackground />}
      {background === "ct-scan" && <CTScanBackground />}
      {background === "storm-synapse" && <StormSynapseBackground />}
      {background === "ember-circuit" && <EmberCircuitBackground />}
      {background === "neon-grid" && <NeonGridBackground />}
      {background === "cyberpunk-grid" && <CyberpunkGridBackground />}
    </>
  );
}

function AppContent() {
  const activePanel = useNavigationStore((s) => s.activePanel);
  const setActivePanel = useNavigationStore((s) => s.setActivePanel);
  const themeId = useThemeStore((s) => s.themeId);
  const isReacher = themeId === "reacher";

  useSessionRecovery();
  useSessionWebSockets();
  useBeforeUnload(false);
  useScrollReveal();

  const panels: Record<Panel, React.ReactNode> = {
    session: <SessionPanel />,
    hardware: <HardwarePanel />,
    program: <ProgramPanel />,
    monitor: <MonitorPanel />,
    data: <DataExport />,
  };

  return (
    <div className="flex h-screen flex-col">
      <BackgroundLayer />
      {isReacher && <CyberpunkCursor />}
      <DemoModeBanner />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={activePanel} onSelect={(key) => setActivePanel(key as Panel)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <ErrorBoundary>
              {Object.entries(panels).map(([key, panel]) => (
                <div key={key} className="reveal" style={{ display: key === activePanel ? undefined : "none" }}>
                  {panel}
                </div>
              ))}
            </ErrorBoundary>
          </main>
          <TerminalPanel />
        </div>
      </div>
      {isReacher && (
        <footer className="border-t border-theme-border bg-panel/50 px-4 py-2 text-center"
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.1em", color: "rgb(var(--color-text-dim, var(--color-text-secondary)))" }}>
          (c) 2026 LOGISTECH // ALL RIGHTS RESERVED // BUILD 2.0.0
        </footer>
      )}
      <SessionStartModal />
      <TutorialOverlay />
      <HelpPanel />
      <WelcomeScreen />
    </div>
  );
}

export default function App() {
  const blocked = useSingleTab();

  if (blocked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <BackgroundLayer />
        <div className="relative z-10 text-center text-theme-text">
          <p className="text-lg font-bold text-accent">Labrynth is already open in another tab.</p>
          <p className="mt-2 text-sm">Close this tab and return to the original.</p>
        </div>
      </div>
    );
  }

  return <AppContent />;
}
