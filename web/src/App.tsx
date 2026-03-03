import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { NeuralBackground } from "./components/layout/NeuralBackground";
import { CTScanBackground } from "./components/layout/CTScanBackground";
import { StormSynapseBackground } from "./components/layout/StormSynapseBackground";
import { EmberCircuitBackground } from "./components/layout/EmberCircuitBackground";
import { NeonGridBackground } from "./components/layout/NeonGridBackground";
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
import { useBeforeUnload } from "./hooks/useBeforeUnload";
import { useSingleTab } from "./hooks/useSingleTab";
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
    </>
  );
}

function AppContent() {
  const activePanel = useNavigationStore((s) => s.activePanel);
  const setActivePanel = useNavigationStore((s) => s.setActivePanel);

  useSessionWebSockets();
  useBeforeUnload(false);

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
      <DemoModeBanner />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={activePanel} onSelect={(key) => setActivePanel(key as Panel)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <ErrorBoundary>
              {Object.entries(panels).map(([key, panel]) => (
                <div key={key} style={{ display: key === activePanel ? undefined : "none" }}>
                  {panel}
                </div>
              ))}
            </ErrorBoundary>
          </main>
          <TerminalPanel />
        </div>
      </div>
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
