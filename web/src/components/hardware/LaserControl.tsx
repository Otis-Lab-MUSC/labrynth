import * as api from "../../api/client";
import { useSessionStore } from "../../store/useSessionStore";
import type { SessionState } from "../../types";
import { HARDWARE_PINS } from "./pins";

/** Map laser frequency (Hz) to a perceptible animation duration (seconds). */
function computeAnimationDuration(frequency: number): number {
  const clamped = Math.max(1, Math.min(frequency, 100));
  return Math.max(0.15, 2.0 - ((clamped - 1) * 1.85) / 99);
}

/** Square-wave polyline points for 4 cycles (3 visible through viewBox clipping). */
const WAVE_POINTS = "0,14 0,4 10,4 10,14 20,14 20,4 30,4 30,14 40,14 40,4 50,4 50,14 60,14 60,4 70,4 70,14 80,14";
const FLAT_POINTS = "0,9 80,9";

function LaserWaveIndicator({
  frequency,
  armed,
  sessionState,
}: {
  frequency: number;
  armed: boolean;
  sessionState: SessionState;
}) {
  const isRunning = sessionState === "running";
  const isPaused = sessionState === "paused";
  const showWave = armed && (isRunning || isPaused);
  const animate = isRunning && armed;

  const strokeColor = animate
    ? "#22c55e"
    : isPaused && armed
      ? "#f59e0b"
      : "rgb(var(--color-text-primary) / 0.25)";

  return (
    <svg
      width="60"
      height="18"
      viewBox="0 0 60 18"
      className="inline-block align-middle ml-2"
      aria-hidden="true"
    >
      <polyline
        points={showWave ? WAVE_POINTS : FLAT_POINTS}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinejoin="miter"
        className={animate ? "animate-laser-scroll" : undefined}
        style={animate ? { animationDuration: `${computeAnimationDuration(frequency)}s` } : undefined}
      />
    </svg>
  );
}

interface Props {
  sessionId: string;
}

export function LaserControl({ sessionId }: Props) {
  const laser = useSessionStore((s) => s.sessions.get(sessionId)?.hardwareUi.laser);
  const sessionState = useSessionStore((s) => s.sessions.get(sessionId)?.state ?? "idle");
  const updateHardwareUi = useSessionStore((s) => s.updateHardwareUi);

  if (!laser) return null;

  const { armed, frequency, duration } = laser;
  const send = (code: number, value?: number) => api.sendCommand(sessionId, code, value);

  return (
    <div className="card">
      <h3 className="font-medium text-theme-text">
        Laser
        <LaserWaveIndicator frequency={frequency} armed={armed} sessionState={sessionState} />
        <span className="ml-2 text-xs font-mono text-theme-text/40">Pin {HARDWARE_PINS.LASER}</span>
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { send(601); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, armed: true } })); }}
          className={`btn-sm ${armed ? "btn-toggle-green-on" : "btn-toggle-green-off"}`}
        >Arm</button>
        <button
          onClick={() => { send(600); updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, armed: false } })); }}
          className={`btn-sm ${!armed ? "btn-toggle-red-on" : "btn-toggle-red-off"}`}
        >Disarm</button>
        <button onClick={() => send(603)} className="btn-sm bg-yellow-600 text-white">Test</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => send(681)} className="btn-sm bg-purple-600 text-white">Contingent</button>
        <button onClick={() => send(682)} className="btn-sm bg-purple-500 text-white">Independent</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Freq (Hz):</label>
        <input type="number" value={frequency} min={1} max={65535}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, frequency: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(671, frequency)}
          disabled={frequency < 1 || frequency > 65535}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-theme-text/60">Dur (ms):</label>
        <input type="number" value={duration} min={1} max={600000}
          onChange={(e) => updateHardwareUi(sessionId, (prev) => ({ laser: { ...prev.laser, duration: +e.target.value } }))}
          className="w-24 input-base" />
        <button onClick={() => send(672, duration)}
          disabled={duration < 1 || duration > 600000}
          className="btn-sm bg-accent text-accent-contrast disabled:opacity-50">Set</button>
      </div>
    </div>
  );
}
