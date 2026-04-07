import { useEffect, useRef } from "react";
import { useThemeStore } from "../../store/useThemeStore";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isHub: boolean;
}

interface Pulse {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
}

interface Ripple {
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
  return [139, 92, 246]; // fallback purple
}

export function NeuralBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(useThemeStore.getState().mode);
  const accentRef = useRef<[number, number, number]>(readAccentRgb());

  useEffect(() => {
    const unsub = useThemeStore.subscribe((s) => {
      modeRef.current = s.mode;
      // Defer reading computed style to next frame so CSS vars have settled
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
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let ripples: Ripple[] = [];
    const activeConnections = new Set<string>();

    const NODE_COUNT = 50;
    const CONNECTION_DIST = 150;
    const PULSE_CHANCE = 0.004;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initNodes() {
      nodes = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        const isHub = Math.random() < 0.1;
        nodes.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          radius: isHub ? 6 + Math.random() * 4 : 2 + Math.random() * 4,
          isHub,
        });
      }
    }

    function draw() {
      if (document.hidden) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      const isDark = modeRef.current === "dark";
      const [ar, ag, ab] = accentRef.current;

      ctx!.clearRect(0, 0, w, h);

      // Update node positions
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.vx += (Math.random() - 0.5) * 0.02;
        node.vy += (Math.random() - 0.5) * 0.02;
        node.vx *= 0.99;
        node.vy *= 0.99;
        if (node.x < -20) node.x = w + 20;
        if (node.x > w + 20) node.x = -20;
        if (node.y < -20) node.y = h + 20;
        if (node.y > h + 20) node.y = -20;
      }

      // Track current connections for ripple detection
      const currentConnections = new Set<string>();

      // Draw edges
      ctx!.save();
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DIST) {
            const connKey = `${i}-${j}`;
            currentConnections.add(connKey);

            const alpha = (1 - dist / CONNECTION_DIST) * (isDark ? 0.15 : 0.08);
            const isHubEdge = nodes[i].isHub || nodes[j].isHub;
            const isClose = dist < 100;

            ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
            ctx!.lineWidth = isHubEdge ? 2 : 1;

            if (isClose) {
              ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${alpha * 0.5})`;
              ctx!.shadowBlur = 4;
            } else {
              ctx!.shadowBlur = 0;
            }

            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.stroke();

            // Spawn ripple on new connection formation
            if (!activeConnections.has(connKey) && Math.random() < 0.3 && ripples.length < 30) {
              ripples.push({
                x: (nodes[i].x + nodes[j].x) / 2,
                y: (nodes[i].y + nodes[j].y) / 2,
                progress: 0,
                maxRadius: 30,
              });
            }

            if (Math.random() < PULSE_CHANCE) {
              pulses.push({
                fromIdx: i,
                toIdx: j,
                progress: 0,
                speed: 0.005 + Math.random() * 0.02,
              });
            }
          }
        }
      }
      ctx!.restore();

      // Update active connections for next frame
      activeConnections.clear();
      for (const key of currentConnections) {
        activeConnections.add(key);
      }

      // Draw and update ripples
      ripples = ripples.filter((r) => {
        r.progress += 1 / 25; // ~25 frames
        if (r.progress >= 1) return false;

        const radius = r.progress * r.maxRadius;
        const alpha = (1 - r.progress) * (isDark ? 0.2 : 0.12);

        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx!.stroke();

        return true;
      });

      // Draw and update pulses
      const bright = isDark ? 0.8 : 0.6;
      ctx!.save();
      pulses = pulses.filter((p) => {
        p.progress += p.speed;
        if (p.progress >= 1) return false;

        const from = nodes[p.fromIdx];
        const to = nodes[p.toIdx];
        const px = from.x + (to.x - from.x) * p.progress;
        const py = from.y + (to.y - from.y) * p.progress;

        ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${bright})`;
        ctx!.shadowBlur = 6;
        ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${bright})`;
        ctx!.beginPath();
        ctx!.arc(px, py, 3, 0, Math.PI * 2);
        ctx!.fill();

        return true;
      });
      ctx!.restore();

      // Draw nodes with radial gradient and hub glow
      for (const node of nodes) {
        const nodeAlpha = isDark ? 0.4 : 0.25;

        // Hub outer glow
        if (node.isHub) {
          ctx!.save();
          ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${isDark ? 0.5 : 0.3})`;
          ctx!.shadowBlur = 12;
          ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${nodeAlpha * 0.3})`;
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }

        // Radial gradient fill for natural bloom
        const grad = ctx!.createRadialGradient(
          node.x, node.y, 0,
          node.x, node.y, node.radius
        );
        grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, ${nodeAlpha * 1.5})`);
        grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, ${nodeAlpha * 0.2})`);

        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      animationId = requestAnimationFrame(draw);
    }

    resize();
    initNodes();
    draw();

    const handleResize = () => {
      resize();
      initNodes();
    };
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
