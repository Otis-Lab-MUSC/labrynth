import { useEffect, useRef } from "react";
import { useThemeStore } from "../../store/useThemeStore";

interface GridPulse {
  x: number;
  y: number;
  progress: number;
  maxRadius: number;
}

function readAccentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  return [22, 163, 74]; // fallback green
}

export function CTScanBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(useThemeStore.getState().mode);
  const accentRef = useRef<[number, number, number]>(readAccentRgb());

  useEffect(() => {
    const unsub = useThemeStore.subscribe((s) => {
      modeRef.current = s.mode;
      requestAnimationFrame(() => {
        accentRef.current = readAccentRgb();
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let pulses: GridPulse[] = [];
    let scanY = 0;
    let scanPaused = 0;
    let lastPulseTime = 0;

    const PRIMARY_GRID = 80;
    const SECONDARY_GRID = 20;
    const SCAN_DURATION = 8000; // ms for full sweep
    const SCAN_PAUSE = 2000; // ms pause at bottom
    const BRACKET_SIZE = 40;
    const BRACKET_MARGIN = 20;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGrid(w: number, h: number, ar: number, ag: number, ab: number, isDark: boolean) {
      // Secondary grid (fine)
      const secondaryAlpha = isDark ? 0.03 : 0.015;
      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${secondaryAlpha})`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let x = 0; x <= w; x += SECONDARY_GRID) {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += SECONDARY_GRID) {
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
      }
      ctx!.stroke();

      // Primary grid
      const primaryAlpha = isDark ? 0.08 : 0.04;
      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${primaryAlpha})`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let x = 0; x <= w; x += PRIMARY_GRID) {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += PRIMARY_GRID) {
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
      }
      ctx!.stroke();
    }

    function drawCrosshair(w: number, h: number, ar: number, ag: number, ab: number, isDark: boolean) {
      const cx = w / 2;
      const cy = h / 2;
      const alpha = isDark ? 0.12 : 0.06;
      const radii = [60, 120, 180];

      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
      ctx!.lineWidth = 1;

      // Concentric circles
      for (const r of radii) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // Tick marks every 45 degrees on outermost circle
      const outerR = radii[radii.length - 1];
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const innerTick = outerR - 8;
        const outerTick = outerR + 8;
        ctx!.beginPath();
        ctx!.moveTo(cx + Math.cos(angle) * innerTick, cy + Math.sin(angle) * innerTick);
        ctx!.lineTo(cx + Math.cos(angle) * outerTick, cy + Math.sin(angle) * outerTick);
        ctx!.stroke();
      }

      // Center crosshair
      const crossSize = 15;
      ctx!.beginPath();
      ctx!.moveTo(cx - crossSize, cy);
      ctx!.lineTo(cx + crossSize, cy);
      ctx!.moveTo(cx, cy - crossSize);
      ctx!.lineTo(cx, cy + crossSize);
      ctx!.stroke();
    }

    function drawScanLine(w: number, ar: number, ag: number, ab: number, isDark: boolean, now: number) {
      const h = window.innerHeight;
      const totalCycle = SCAN_DURATION + SCAN_PAUSE;
      const cyclePos = now % totalCycle;

      if (cyclePos < SCAN_DURATION) {
        scanY = (cyclePos / SCAN_DURATION) * h;
        scanPaused = 0;
      } else {
        scanY = h;
        scanPaused = cyclePos - SCAN_DURATION;
      }

      if (scanPaused > 0) return;

      const peakAlpha = isDark ? 0.3 : 0.15;

      // Trailing lines
      const trails = [
        { offset: -8, alpha: peakAlpha * 0.3 },
        { offset: -4, alpha: peakAlpha * 0.6 },
        { offset: 0, alpha: peakAlpha },
      ];

      for (const trail of trails) {
        const y = scanY + trail.offset;
        if (y < 0 || y > h) continue;
        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${trail.alpha})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }
    }

    function spawnPulses(w: number, h: number, now: number) {
      if (now - lastPulseTime < 2000) return;
      lastPulseTime = now;

      const count = 3 + Math.floor(Math.random() * 3); // 3-5
      for (let i = 0; i < count; i++) {
        const gx = Math.floor(Math.random() * (w / PRIMARY_GRID)) * PRIMARY_GRID;
        const gy = Math.floor(Math.random() * (h / PRIMARY_GRID)) * PRIMARY_GRID;
        if (pulses.length < 20) {
          pulses.push({ x: gx, y: gy, progress: 0, maxRadius: 15 });
        }
      }
    }

    function drawPulses(ar: number, ag: number, ab: number, isDark: boolean) {
      pulses = pulses.filter((p) => {
        p.progress += 1 / 90; // ~1.5s at 60fps
        if (p.progress >= 1) return false;

        const r = p.progress * p.maxRadius;
        const alpha = (1 - p.progress) * (isDark ? 0.4 : 0.2);

        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx!.stroke();

        return true;
      });
    }

    function drawCornerBrackets(w: number, h: number, ar: number, ag: number, ab: number, isDark: boolean) {
      const alpha = isDark ? 0.15 : 0.08;
      const m = BRACKET_MARGIN;
      const s = BRACKET_SIZE;

      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
      ctx!.lineWidth = 1.5;

      // Top-left
      ctx!.beginPath();
      ctx!.moveTo(m, m + s);
      ctx!.lineTo(m, m);
      ctx!.lineTo(m + s, m);
      ctx!.stroke();

      // Top-right
      ctx!.beginPath();
      ctx!.moveTo(w - m - s, m);
      ctx!.lineTo(w - m, m);
      ctx!.lineTo(w - m, m + s);
      ctx!.stroke();

      // Bottom-left
      ctx!.beginPath();
      ctx!.moveTo(m, h - m - s);
      ctx!.lineTo(m, h - m);
      ctx!.lineTo(m + s, h - m);
      ctx!.stroke();

      // Bottom-right
      ctx!.beginPath();
      ctx!.moveTo(w - m - s, h - m);
      ctx!.lineTo(w - m, h - m);
      ctx!.lineTo(w - m, h - m - s);
      ctx!.stroke();
    }

    function draw(now: number) {
      if (document.hidden) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      const isDark = modeRef.current === "dark";
      const [ar, ag, ab] = accentRef.current;

      ctx!.clearRect(0, 0, w, h);

      drawGrid(w, h, ar, ag, ab, isDark);
      drawCrosshair(w, h, ar, ag, ab, isDark);
      drawScanLine(w, ar, ag, ab, isDark, now);
      spawnPulses(w, h, now);
      drawPulses(ar, ag, ab, isDark);
      drawCornerBrackets(w, h, ar, ag, ab, isDark);

      animationId = requestAnimationFrame(draw);
    }

    resize();
    animationId = requestAnimationFrame(draw);

    const handleResize = () => resize();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
