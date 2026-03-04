import { useEffect, useRef } from "react";
import { useContainerWidth } from "../../hooks/useContainerWidth";
import { useThemeStore } from "../../store/useThemeStore";

interface SquareWaveCanvasProps {
  frequency: number;
  duration: number;
}

/** Number of cycles to fit in the visible window at any frequency. */
const TARGET_CYCLES = 8;

/** Minimum time window in seconds (floor for extreme high frequencies). */
const MIN_TIME_WINDOW = 0.0001;

/** Maximum time window in seconds (ceiling for low frequencies). */
const MAX_TIME_WINDOW = 3.0;

/** Real seconds to sweep through one full burst. */
const SWEEP_PERIOD = 4.0;

/** Pause in real seconds after sweep ends before looping. */
const LOOP_REST = 1.5;

/** Burst durations above this (seconds) use continuous scroll instead of sweep. */
const LONG_BURST_THRESHOLD = 30;

/** Canvas vertical padding and layout constants. */
const PADDING_TOP = 28;
const PADDING_BOTTOM = 24;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
const CANVAS_HEIGHT = 180;

function readCssColor(prop: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(prop)
    .trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  return [128, 128, 128];
}

/** Returns a "nice" grid interval for the given range and target line count. */
function niceGridInterval(range: number, targetLines: number): number {
  const rough = range / targetLines;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let nice: number;
  if (norm <= 1.5) nice = 1;
  else if (norm <= 3.5) nice = 2;
  else if (norm <= 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
}

/** Returns the appropriate time unit suffix for a given window scale. */
function timeUnit(windowSec: number): string {
  if (windowSec < 0.001) return "\u00b5s";
  if (windowSec < 1) return "ms";
  return "s";
}

/** Formats a time value (in seconds) for axis labels based on window scale. */
function formatTimeLabel(t: number, windowSec: number): string {
  let val: number;
  if (windowSec < 0.001) {
    val = t * 1e6;
  } else if (windowSec < 1) {
    val = t * 1e3;
  } else {
    val = t;
  }
  return Math.abs(val - Math.round(val)) < 0.01 ? val.toFixed(0) : val.toFixed(1);
}

export function SquareWaveCanvas({ frequency, duration }: SquareWaveCanvasProps) {
  const [containerRef, containerWidth] = useContainerWidth();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store props in refs so the animation loop reads current values without restarting.
  const freqRef = useRef(frequency);
  const durRef = useRef(duration);
  useEffect(() => { freqRef.current = frequency; }, [frequency]);
  useEffect(() => { durRef.current = duration; }, [duration]);

  // Theme colors stored in refs, updated via subscription.
  const accentRef = useRef<[number, number, number]>(readCssColor("--color-accent"));
  const textRef = useRef<[number, number, number]>(readCssColor("--color-text-primary"));
  const borderRef = useRef<[number, number, number]>(readCssColor("--color-border"));
  const panelRef = useRef<[number, number, number]>(readCssColor("--color-panel"));

  useEffect(() => {
    const unsub = useThemeStore.subscribe(() => {
      requestAnimationFrame(() => {
        accentRef.current = readCssColor("--color-accent");
        textRef.current = readCssColor("--color-text-primary");
        borderRef.current = readCssColor("--color-border");
        panelRef.current = readCssColor("--color-panel");
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerWidth === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;

    // Size canvas for HiDPI.
    canvas.width = containerWidth * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const plotW = containerWidth - PADDING_LEFT - PADDING_RIGHT;
    const plotH = CANVAS_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    let animId: number;
    let timeOffset = 0;
    let lastTime = 0;
    let realElapsed = 0;
    let prevFreq = freqRef.current;
    let prevDur = durRef.current;

    function rgb(c: [number, number, number], a = 1) {
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    }

    function drawFrame(timeWindow: number) {
      const freq = freqRef.current;
      const durMs = durRef.current;
      const durationSec = durMs / 1000;
      const [ar, ag, ab] = accentRef.current;
      const textColor = textRef.current;
      const borderColor = borderRef.current;
      const panelColor = panelRef.current;

      const tStart = timeOffset;
      const tEnd = tStart + timeWindow;

      ctx!.clearRect(0, 0, containerWidth, CANVAS_HEIGHT);

      // Plot background — dark overlay for oscilloscope look.
      ctx!.fillStyle = rgb(panelColor, 1);
      ctx!.fillRect(PADDING_LEFT, PADDING_TOP, plotW, plotH);
      ctx!.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx!.fillRect(PADDING_LEFT, PADDING_TOP, plotW, plotH);

      // Grid lines.
      ctx!.setLineDash([4, 4]);
      ctx!.lineWidth = 1;
      // Horizontal grid at 0.25, 0.50, 0.75 amplitude.
      for (const frac of [0.25, 0.5, 0.75]) {
        const y = PADDING_TOP + plotH * (1 - frac);
        ctx!.strokeStyle = rgb(borderColor, 0.15);
        ctx!.beginPath();
        ctx!.moveTo(PADDING_LEFT, y);
        ctx!.lineTo(PADDING_LEFT + plotW, y);
        ctx!.stroke();
      }
      // Vertical grid at adaptive intervals.
      const gridStep = niceGridInterval(timeWindow, 5);
      const firstGrid = Math.ceil(tStart / gridStep) * gridStep;
      for (let t = firstGrid; t <= tEnd; t += gridStep) {
        const x = PADDING_LEFT + ((t - tStart) / timeWindow) * plotW;
        ctx!.strokeStyle = rgb(borderColor, 0.15);
        ctx!.beginPath();
        ctx!.moveTo(x, PADDING_TOP);
        ctx!.lineTo(x, PADDING_TOP + plotH);
        ctx!.stroke();
      }
      ctx!.setLineDash([]);

      // Axes.
      ctx!.strokeStyle = rgb(borderColor, 0.4);
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(PADDING_LEFT, PADDING_TOP);
      ctx!.lineTo(PADDING_LEFT, PADDING_TOP + plotH);
      ctx!.lineTo(PADDING_LEFT + plotW, PADDING_TOP + plotH);
      ctx!.stroke();

      // Axis labels.
      ctx!.font = "10px 'JetBrains Mono', monospace";
      ctx!.fillStyle = rgb(textColor, 0.5);
      ctx!.textAlign = "right";
      ctx!.textBaseline = "middle";
      for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
        const y = PADDING_TOP + plotH * (1 - frac);
        ctx!.fillText(frac.toFixed(2), PADDING_LEFT - 4, y);
      }
      // Time axis labels at grid positions.
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      for (let t = firstGrid; t <= tEnd; t += gridStep) {
        const x = PADDING_LEFT + ((t - tStart) / timeWindow) * plotW;
        ctx!.fillText(formatTimeLabel(t, timeWindow), x, PADDING_TOP + plotH + 4);
      }
      // Label the left edge if not near a grid line.
      if (firstGrid - tStart > gridStep * 0.3) {
        ctx!.fillText(
          formatTimeLabel(tStart, timeWindow),
          PADDING_LEFT,
          PADDING_TOP + plotH + 4,
        );
      }
      // X-axis unit label.
      ctx!.fillText(timeUnit(timeWindow), PADDING_LEFT + plotW + 6, PADDING_TOP + plotH + 4);

      // Title.
      ctx!.font = "12px 'JetBrains Mono', monospace";
      ctx!.fillStyle = rgb(textColor, 0.8);
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      const durLabel = durMs >= 1000
        ? `${(durMs / 1000).toFixed(durMs >= 10000 ? 0 : 1)} s`
        : `${durMs} ms`;
      ctx!.fillText(
        `Square Wave \u2013 ${freq} Hz \u00b7 ${durLabel}`,
        PADDING_LEFT + plotW / 2,
        4,
      );

      // Square wave rendering.
      const period = 1 / Math.max(freq, 1);
      const halfPeriod = period / 2;

      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(PADDING_LEFT, PADDING_TOP, plotW, plotH);
      ctx!.clip();

      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.9)`;
      ctx!.lineWidth = 2;
      ctx!.lineJoin = "miter";
      ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, 0.4)`;
      ctx!.shadowBlur = 6;

      const yHigh = PADDING_TOP + plotH * 0.05;
      const yLow = PADDING_TOP + plotH * 0.95;

      ctx!.beginPath();

      if (tStart >= durationSec) {
        // Entire window is past the burst — flat LOW line.
        ctx!.moveTo(PADDING_LEFT, yLow);
        ctx!.lineTo(PADDING_LEFT + plotW, yLow);
      } else {
        // Some oscillation is visible.
        const phaseAtStart = ((tStart % period) + period) % period;
        let isHigh = phaseAtStart < halfPeriod;
        let y = isHigh ? yHigh : yLow;
        ctx!.moveTo(PADDING_LEFT, y);

        // Find the next edge after tStart.
        let nextEdge: number;
        if (isHigh) {
          const cycleStart = tStart - phaseAtStart;
          nextEdge = cycleStart + halfPeriod;
          if (nextEdge <= tStart) nextEdge += period;
        } else {
          const cycleStart = tStart - phaseAtStart;
          nextEdge = cycleStart + period;
          if (nextEdge <= tStart) nextEdge += period;
        }

        // Walk edges, stopping at burst boundary or window end.
        const walkEnd = Math.min(durationSec, tEnd);
        while (nextEdge < walkEnd) {
          const x = PADDING_LEFT + ((nextEdge - tStart) / timeWindow) * plotW;
          ctx!.lineTo(x, y);
          isHigh = !isHigh;
          y = isHigh ? yHigh : yLow;
          ctx!.lineTo(x, y);
          nextEdge += halfPeriod;
        }

        // If burst ends within the visible window, drop to LOW and flat line.
        if (durationSec < tEnd) {
          const xBurst = PADDING_LEFT + ((durationSec - tStart) / timeWindow) * plotW;
          ctx!.lineTo(xBurst, y);
          if (y !== yLow) {
            ctx!.lineTo(xBurst, yLow);
          }
          ctx!.lineTo(PADDING_LEFT + plotW, yLow);
        } else {
          ctx!.lineTo(PADDING_LEFT + plotW, y);
        }
      }

      ctx!.stroke();
      ctx!.restore();

      // Burst-end marker line when visible in the window.
      if (durationSec > tStart && durationSec < tEnd) {
        const xBurst = PADDING_LEFT + ((durationSec - tStart) / timeWindow) * plotW;
        ctx!.save();
        ctx!.setLineDash([4, 4]);
        ctx!.strokeStyle = rgb(textColor, 0.4);
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(xBurst, PADDING_TOP);
        ctx!.lineTo(xBurst, PADDING_TOP + plotH);
        ctx!.stroke();
        ctx!.setLineDash([]);

        ctx!.font = "10px 'JetBrains Mono', monospace";
        ctx!.fillStyle = rgb(textColor, 0.5);
        ctx!.textAlign = "center";
        ctx!.textBaseline = "bottom";
        ctx!.fillText(durLabel, xBurst, PADDING_TOP - 2);
        ctx!.restore();
      }
    }

    function animate(now: number) {
      if (document.hidden) {
        lastTime = now;
        animId = requestAnimationFrame(animate);
        return;
      }

      const dt = lastTime ? (now - lastTime) / 1000 : 0;
      lastTime = now;

      const freq = freqRef.current;
      const dur = durRef.current;

      // Reset animation on prop change.
      if (freq !== prevFreq || dur !== prevDur) {
        prevFreq = freq;
        prevDur = dur;
        realElapsed = 0;
      } else {
        realElapsed += dt;
      }

      const durationSec = dur / 1000;
      const timeWindow = Math.max(
        MIN_TIME_WINDOW,
        Math.min(MAX_TIME_WINDOW, TARGET_CYCLES / Math.max(freq, 1)),
      );

      // Tiered animation.
      if (durationSec <= timeWindow) {
        // Static — entire burst fits in one frame.
        timeOffset = 0;
      } else if (durationSec <= LONG_BURST_THRESHOLD) {
        // Sweep — scroll through burst over SWEEP_PERIOD, then rest and loop.
        const sweepRange = Math.max(0, durationSec - timeWindow * 0.5);
        const totalCycle = SWEEP_PERIOD + LOOP_REST;
        const cycleTime = realElapsed % totalCycle;
        timeOffset = cycleTime < SWEEP_PERIOD
          ? (cycleTime / SWEEP_PERIOD) * sweepRange
          : sweepRange;
      } else {
        // Continuous — endless scrolling for very long bursts.
        timeOffset = realElapsed * timeWindow * 0.3;
      }

      drawFrame(timeWindow);
      animId = requestAnimationFrame(animate);
    }

    if (reducedMotion) {
      timeOffset = 0;
      const freq = freqRef.current;
      const tw = Math.max(
        MIN_TIME_WINDOW,
        Math.min(MAX_TIME_WINDOW, TARGET_CYCLES / Math.max(freq, 1)),
      );
      drawFrame(tw);
    } else {
      animId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [containerWidth]);

  return (
    <div ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="w-full rounded"
        style={{ height: CANVAS_HEIGHT }}
      />
    </div>
  );
}
