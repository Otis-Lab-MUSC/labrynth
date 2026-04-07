import { useEffect, useRef } from "react";
import { useThemeStore } from "../../store/useThemeStore";

interface PulseWave {
  z: number;
  speed: number;
  intensity: number;
}

const Z_NEAR = 1;
const Z_FAR = 40;
const FOCAL_LENGTH = 300;
const GRID_HALF_WIDTH = 800;
const H_LINES = 25;
const V_LINES = 21;
const MAX_PULSES = 3;
const PULSE_SPAWN_MIN = 3000;
const PULSE_SPAWN_MAX = 6000;
const SCANLINE_SPACING = 3;

function readAccentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  return [0, 212, 216];
}

export function NeonGridBackground() {
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

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animationId: number;
    let pulses: PulseWave[] = [];
    let nextPulseTime = 0;
    let needsStaticRedraw = true;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      needsStaticRedraw = true;
    }

    function projectX(gridX: number, z: number, vanishX: number): number {
      const scale = FOCAL_LENGTH / z;
      return vanishX + gridX * scale;
    }

    function projectY(z: number, horizonY: number, cameraH: number): number {
      const scale = FOCAL_LENGTH / z;
      return horizonY + cameraH * scale;
    }

    function drawGrid(w: number, h: number, ar: number, ag: number, ab: number, isDark: boolean, cameraH: number) {
      const horizonY = h * 0.38;
      const vanishX = w / 2;
      const baseAlpha = isDark ? 0.15 : 0.07;

      // Horizontal lines — quadratic z-spacing (denser near horizon)
      ctx!.lineWidth = 1;
      for (let i = 0; i < H_LINES; i++) {
        const t = i / (H_LINES - 1);
        const z = Z_FAR - (Z_FAR - Z_NEAR) * t * t;
        const y = projectY(z, horizonY, cameraH);
        if (y > h) continue;

        const depthFade = 1 - (i / H_LINES) * 0.7;
        const alpha = baseAlpha * depthFade;
        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
        ctx!.beginPath();

        const xLeft = projectX(-GRID_HALF_WIDTH, z, vanishX);
        const xRight = projectX(GRID_HALF_WIDTH, z, vanishX);
        ctx!.moveTo(xLeft, y);
        ctx!.lineTo(xRight, y);
        ctx!.stroke();
      }

      // Vertical lines — converge to vanishing point
      const halfCount = Math.floor(V_LINES / 2);
      const spacing = GRID_HALF_WIDTH / halfCount;

      for (let i = -halfCount; i <= halfCount; i++) {
        const gridX = i * spacing;
        const centerFade = 1 - Math.abs(i) / (halfCount + 1) * 0.5;
        const alpha = baseAlpha * centerFade;
        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
        ctx!.beginPath();

        const nearY = projectY(Z_NEAR, horizonY, cameraH);
        const farY = projectY(Z_FAR, horizonY, cameraH);
        const nearX = projectX(gridX, Z_NEAR, vanishX);
        const farX = projectX(gridX, Z_FAR, vanishX);

        const clampedNearY = Math.min(nearY, h);
        ctx!.moveTo(farX, farY);
        ctx!.lineTo(nearX, clampedNearY);
        ctx!.stroke();
      }
    }

    function drawHorizonGlow(w: number, h: number, ar: number, ag: number, ab: number, isDark: boolean) {
      const horizonY = h * 0.38;
      const alpha = isDark ? 0.4 : 0.2;

      ctx!.save();
      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
      ctx!.lineWidth = 1;
      ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${alpha * 0.8})`;
      ctx!.shadowBlur = 12;
      ctx!.beginPath();
      ctx!.moveTo(0, horizonY);
      ctx!.lineTo(w, horizonY);
      ctx!.stroke();
      ctx!.restore();
    }

    function drawPulseWaves(w: number, h: number, ar: number, ag: number, ab: number, isDark: boolean, dt: number, cameraH: number) {
      const horizonY = h * 0.38;

      pulses = pulses.filter((pulse) => {
        pulse.z -= pulse.speed * dt;
        if (pulse.z <= Z_NEAR) return false;

        const progress = 1 - (pulse.z - Z_NEAR) / (Z_FAR - Z_NEAR);
        const intensity = Math.sin(progress * Math.PI) * pulse.intensity;
        const y = projectY(pulse.z, horizonY, cameraH);
        if (y > h) return true;

        const alpha = intensity * (isDark ? 0.35 : 0.18);

        // Primary glow
        ctx!.save();
        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
        ctx!.lineWidth = 2;
        ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${alpha * 0.6})`;
        ctx!.shadowBlur = 8;
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
        ctx!.restore();

        // Secondary lighter cyan
        ctx!.save();
        ctx!.strokeStyle = `rgba(125, 232, 232, ${alpha * 0.4})`;
        ctx!.lineWidth = 1;
        ctx!.shadowColor = `rgba(125, 232, 232, ${alpha * 0.3})`;
        ctx!.shadowBlur = 4;
        ctx!.beginPath();
        ctx!.moveTo(0, y - 2);
        ctx!.lineTo(w, y - 2);
        ctx!.stroke();
        ctx!.restore();

        return true;
      });
    }

    function spawnPulse(now: number) {
      if (now < nextPulseTime || pulses.length >= MAX_PULSES) return;
      pulses.push({
        z: Z_FAR,
        speed: 8 + Math.random() * 4,
        intensity: 0.6 + Math.random() * 0.4,
      });
      nextPulseTime = now + PULSE_SPAWN_MIN + Math.random() * (PULSE_SPAWN_MAX - PULSE_SPAWN_MIN);
    }

    function drawScanlines(w: number, h: number, isDark: boolean) {
      const alpha = isDark ? 0.04 : 0.02;
      ctx!.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      for (let y = 0; y < h; y += SCANLINE_SPACING) {
        ctx!.fillRect(0, y, w, 1);
      }
    }

    function drawStaticFrame() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isDark = modeRef.current === "dark";
      const [ar, ag, ab] = accentRef.current;
      const horizonY = h * 0.38;
      const cameraH = (h - horizonY) * Z_NEAR / FOCAL_LENGTH;

      ctx!.clearRect(0, 0, w, h);
      drawGrid(w, h, ar, ag, ab, isDark, cameraH);
      drawHorizonGlow(w, h, ar, ag, ab, isDark);
      drawScanlines(w, h, isDark);
    }

    let lastTime = 0;

    function draw(now: number) {
      if (document.hidden) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
      lastTime = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const isDark = modeRef.current === "dark";
      const [ar, ag, ab] = accentRef.current;
      const horizonY = h * 0.38;
      const cameraH = (h - horizonY) * Z_NEAR / FOCAL_LENGTH;

      ctx!.clearRect(0, 0, w, h);

      drawGrid(w, h, ar, ag, ab, isDark, cameraH);
      drawHorizonGlow(w, h, ar, ag, ab, isDark);
      spawnPulse(now);
      drawPulseWaves(w, h, ar, ag, ab, isDark, dt, cameraH);
      drawScanlines(w, h, isDark);

      animationId = requestAnimationFrame(draw);
    }

    resize();

    if (reducedMotion) {
      drawStaticFrame();

      const handleResize = () => {
        resize();
        if (needsStaticRedraw) {
          drawStaticFrame();
          needsStaticRedraw = false;
        }
      };

      const unsub = useThemeStore.subscribe(() => {
        requestAnimationFrame(() => {
          accentRef.current = readAccentRgb();
          drawStaticFrame();
        });
      });

      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        unsub();
      };
    }

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
