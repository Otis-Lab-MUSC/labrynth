import { useState } from "react";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { NeuralBackground } from "./components/layout/NeuralBackground";
import { CTScanBackground } from "./components/layout/CTScanBackground";
import { StormSynapseBackground } from "./components/layout/StormSynapseBackground";
import { EmberCircuitBackground } from "./components/layout/EmberCircuitBackground";
import { SessionPanel } from "./components/session/SessionPanel";
import { HardwarePanel } from "./components/hardware/HardwarePanel";
import { ProgramPanel } from "./components/program/ProgramPanel";
import { MonitorPanel } from "./components/monitor/MonitorPanel";
import { DataExport } from "./components/data/DataExport";
import { useSessionStore } from "./store/useSessionStore";
import { useThemeStore } from "./store/useThemeStore";
import { useWebSocket } from "./hooks/useWebSocket";
import { useBeforeUnload } from "./hooks/useBeforeUnload";
import { useSingleTab } from "./hooks/useSingleTab";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";

type Panel = "session" | "hardware" | "program" | "monitor" | "data";

export default function App() {
  const blocked = useSingleTab();
  const [activePanel, setActivePanel] = useState<Panel>("session");
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const background = useThemeStore((s) => s.theme.background);

  useWebSocket(blocked ? null : activeSessionId);
  useBeforeUnload(blocked);

  if (blocked) {
    return (
      <div className="flex h-screen items-center justify-center">
        {background === "neural" && <NeuralBackground />}
        {background === "ct-scan" && <CTScanBackground />}
        {background === "storm-synapse" && <StormSynapseBackground />}
        {background === "ember-circuit" && <EmberCircuitBackground />}
        <div className="relative z-10 text-center text-theme-text">
          <p className="text-lg font-bold text-accent">Labrynth is already open in another tab.</p>
          <p className="mt-2 text-sm">Close this tab and return to the original.</p>
        </div>
      </div>
    );
  }

  const panels: Record<Panel, React.ReactNode> = {
    session: <SessionPanel />,
    hardware: <HardwarePanel />,
    program: <ProgramPanel />,
    monitor: <MonitorPanel />,
    data: <DataExport />,
  };

  return (
    <div className="flex h-screen flex-col">
      {background === "neural" && <NeuralBackground />}
      {background === "ct-scan" && <CTScanBackground />}
      {background === "storm-synapse" && <StormSynapseBackground />}
      {background === "ember-circuit" && <EmberCircuitBackground />}
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={activePanel} onSelect={(key) => setActivePanel(key as Panel)} />
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary>
            {Object.entries(panels).map(([key, panel]) => (
              <div key={key} style={{ display: key === activePanel ? undefined : "none" }}>
                {panel}
              </div>
            ))}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
