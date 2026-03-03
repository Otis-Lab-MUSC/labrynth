import { useEffect, useRef } from "react";
import { useContainerWidth } from "../../hooks/useContainerWidth";
import { useThemeStore } from "../../store/useThemeStore";

interface SquareWaveCanvasProps {
  frequency: number;
  duration: number;
}

/** Scroll speed in seconds of waveform time per real second. */
const SCROLL_SPEED = 0.15;

/** Maximum visual cycles rendered (prevents aliasing at high frequencies). */
const MAX_VISUAL_CYCLES = 50;

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

    /** Time window in seconds shown on the x-axis. */
    const TIME_WINDOW = 1.0;

    let animId: number;
    let timeOffset = 0;
    let lastTime = 0;

    function rgb(c: [number, number, number], a = 1) {
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    }

    function drawFrame() {
      const freq = freqRef.current;
      const [ar, ag, ab] = accentRef.current;
      const textColor = textRef.current;
      const borderColor = borderRef.current;
      const panelColor = panelRef.current;

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
      // Vertical grid at 0.2s intervals.
      for (let t = 0.2; t < TIME_WINDOW; t += 0.2) {
        const x = PADDING_LEFT + (t / TIME_WINDOW) * plotW;
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
      // Y-axis.
      ctx!.moveTo(PADDING_LEFT, PADDING_TOP);
      ctx!.lineTo(PADDING_LEFT, PADDING_TOP + plotH);
      // X-axis.
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
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      for (let t = 0; t <= TIME_WINDOW; t += 0.2) {
        const x = PADDING_LEFT + (t / TIME_WINDOW) * plotW;
        ctx!.fillText(t.toFixed(1), x, PADDING_TOP + plotH + 4);
      }
      // X-axis unit label.
      ctx!.fillText("s", PADDING_LEFT + plotW + 6, PADDING_TOP + plotH + 4);

      // Title.
      ctx!.font = "12px 'JetBrains Mono', monospace";
      ctx!.fillStyle = rgb(textColor, 0.8);
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      ctx!.fillText(
        `Square Wave \u2013 ${freq} Hz`,
        PADDING_LEFT + plotW / 2,
        4,
      );

      // Square wave rendering.
      // Cap visual frequency to prevent aliasing.
      const visualFreq = Math.min(freq, MAX_VISUAL_CYCLES / TIME_WINDOW);
      const period = 1 / visualFreq;
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

      // Walk through the time window, computing exact edge positions.
      const tStart = timeOffset;
      const tEnd = timeOffset + TIME_WINDOW;

      // Starting state: is the wave high or low at tStart?
      const phaseAtStart = ((tStart % period) + period) % period;
      let isHigh = phaseAtStart < halfPeriod;
      let y = isHigh ? yHigh : yLow;
      ctx!.moveTo(PADDING_LEFT, y);

      // Find the next edge after tStart.
      let nextEdge: number;
      if (isHigh) {
        // Currently high; next falling edge at the next halfPeriod boundary.
        const cycleStart = tStart - phaseAtStart;
        nextEdge = cycleStart + halfPeriod;
        if (nextEdge <= tStart) nextEdge += period;
      } else {
        // Currently low; next rising edge at the next period boundary.
        const cycleStart = tStart - phaseAtStart;
        nextEdge = cycleStart + period;
        if (nextEdge <= tStart) nextEdge += period;
      }

      while (nextEdge < tEnd) {
        const x = PADDING_LEFT + ((nextEdge - tStart) / TIME_WINDOW) * plotW;
        // Horizontal to edge.
        ctx!.lineTo(x, y);
        // Toggle state.
        isHigh = !isHigh;
        y = isHigh ? yHigh : yLow;
        // Vertical transition.
        ctx!.lineTo(x, y);
        nextEdge += halfPeriod;
      }

      // Final horizontal segment to end.
      ctx!.lineTo(PADDING_LEFT + plotW, y);
      ctx!.stroke();
      ctx!.restore();
    }

    function animate(now: number) {
      if (document.hidden) {
        lastTime = now;
        animId = requestAnimationFrame(animate);
        return;
      }

      const dt = lastTime ? (now - lastTime) / 1000 : 0;
      lastTime = now;
      timeOffset += SCROLL_SPEED * dt;

      drawFrame();
      animId = requestAnimationFrame(animate);
    }

    if (reducedMotion) {
      timeOffset = 0;
      drawFrame();
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
