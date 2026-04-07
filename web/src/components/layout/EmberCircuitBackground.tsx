import { useEffect, useRef } from "react";
import { useThemeStore } from "../../store/useThemeStore";

interface CircuitNode {
  x: number;
  y: number;
  size: number;
  glow: number;
  type: "junction" | "endpoint" | "component";
  connections: number[]; // indices of connected segments
}

interface CircuitSegment {
  from: number;
  to: number;
  orientation: "h" | "v";
  glow: number;
}

interface CurrentFlow {
  segmentIdx: number;
  progress: number;
  speed: number;
  hopsRemaining: number;
  forward: boolean; // direction along segment
}

interface EmberParticle {
  x: number;
  y: number;
  vy: number;
  alpha: number;
  size: number;
  life: number;
}

function readAccentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  return [245, 158, 11];
}

export function EmberCircuitBackground() {
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
    let nodes: CircuitNode[] = [];
    let segments: CircuitSegment[] = [];
    let flows: CurrentFlow[] = [];
    let particles: EmberParticle[] = [];
    let flowTimer = 0;
    const FLOW_INTERVAL_MIN = 120; // ~2s
    const FLOW_INTERVAL_MAX = 180; // ~3s
    let nextFlowAt = FLOW_INTERVAL_MIN + Math.random() * (FLOW_INTERVAL_MAX - FLOW_INTERVAL_MIN);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function generateCircuit() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const spacing = 100 + Math.random() * 40; // 100-140px
      nodes = [];
      segments = [];

      // Create grid positions and randomly place nodes at ~45% of intersections
      const gridCols = Math.ceil(w / spacing) + 1;
      const gridRows = Math.ceil(h / spacing) + 1;
      const gridMap: (number | null)[][] = [];

      for (let row = 0; row < gridRows; row++) {
        gridMap[row] = [];
        for (let col = 0; col < gridCols; col++) {
          if (Math.random() < 0.45) {
            const typeRoll = Math.random();
            const type: CircuitNode["type"] =
              typeRoll < 0.2 ? "component" : typeRoll < 0.35 ? "endpoint" : "junction";
            const idx = nodes.length;
            nodes.push({
              x: col * spacing + (Math.random() - 0.5) * 10,
              y: row * spacing + (Math.random() - 0.5) * 10,
              size: type === "component" ? 6 + Math.random() * 2 : 4 + Math.random() * 2,
              glow: 0,
              type,
              connections: [],
            });
            gridMap[row][col] = idx;
          } else {
            gridMap[row][col] = null;
          }
        }
      }

      // Connect adjacent nodes with orthogonal segments
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const idx = gridMap[row][col];
          if (idx === null) continue;

          // Check right neighbor
          for (let c2 = col + 1; c2 < gridCols; c2++) {
            const right = gridMap[row][c2];
            if (right !== null) {
              const segIdx = segments.length;
              segments.push({ from: idx, to: right, orientation: "h", glow: 0 });
              nodes[idx].connections.push(segIdx);
              nodes[right].connections.push(segIdx);
              break;
            }
          }
          // Check bottom neighbor
          for (let r2 = row + 1; r2 < gridRows; r2++) {
            const below = gridMap[r2][col];
            if (below !== null) {
              const segIdx = segments.length;
              segments.push({ from: idx, to: below, orientation: "v", glow: 0 });
              nodes[idx].connections.push(segIdx);
              nodes[below].connections.push(segIdx);
              break;
            }
          }
        }
      }
    }

    function spawnFlow() {
      if (segments.length === 0 || flows.length >= 5) return;
      const segIdx = Math.floor(Math.random() * segments.length);
      flows.push({
        segmentIdx: segIdx,
        progress: 0,
        speed: 0.02 + Math.random() * 0.015,
        hopsRemaining: 1 + Math.floor(Math.random() * 3), // 1-3 hops
        forward: Math.random() < 0.5,
      });
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

      // --- Spawn current flows ---
      flowTimer++;
      if (flowTimer >= nextFlowAt) {
        spawnFlow();
        flowTimer = 0;
        nextFlowAt = FLOW_INTERVAL_MIN + Math.random() * (FLOW_INTERVAL_MAX - FLOW_INTERVAL_MIN);
      }

      // --- Draw base circuit segments ---
      const baseSegAlpha = isDark ? 0.05 : 0.03;
      for (const seg of segments) {
        const fromNode = nodes[seg.from];
        const toNode = nodes[seg.to];

        // Base faint line
        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${baseSegAlpha})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(fromNode.x, fromNode.y);
        if (seg.orientation === "h") {
          ctx!.lineTo(toNode.x, fromNode.y);
          ctx!.lineTo(toNode.x, toNode.y);
        } else {
          ctx!.lineTo(fromNode.x, toNode.y);
          ctx!.lineTo(toNode.x, toNode.y);
        }
        ctx!.stroke();

        // Glow overlay
        if (seg.glow > 0.01) {
          ctx!.save();
          ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${seg.glow * (isDark ? 0.35 : 0.2)})`;
          ctx!.lineWidth = 2.5;
          ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${seg.glow * 0.3})`;
          ctx!.shadowBlur = 6;
          ctx!.beginPath();
          ctx!.moveTo(fromNode.x, fromNode.y);
          if (seg.orientation === "h") {
            ctx!.lineTo(toNode.x, fromNode.y);
            ctx!.lineTo(toNode.x, toNode.y);
          } else {
            ctx!.lineTo(fromNode.x, toNode.y);
            ctx!.lineTo(toNode.x, toNode.y);
          }
          ctx!.stroke();
          ctx!.restore();
        }

        // Decay glow
        seg.glow *= 0.96;
      }

      // --- Draw base circuit nodes ---
      const baseNodeAlpha = isDark ? 0.07 : 0.04;
      for (const node of nodes) {
        // Glow overlay
        if (node.glow > 0.01) {
          ctx!.save();
          const grad = ctx!.createRadialGradient(
            node.x, node.y, 0,
            node.x, node.y, node.size * 2.5,
          );
          grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, ${node.glow * (isDark ? 0.4 : 0.25)})`);
          grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
          ctx!.fillStyle = grad;
          ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${node.glow * 0.3})`;
          ctx!.shadowBlur = 8;
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, node.size * 2.5, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }

        // Base shape
        ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${Math.max(baseNodeAlpha, node.glow * (isDark ? 0.3 : 0.18))})`;
        if (node.type === "component") {
          // Small rectangle
          const half = node.size / 2;
          ctx!.fillRect(node.x - half * 1.4, node.y - half, half * 2.8, half * 2);
        } else if (node.type === "endpoint") {
          // Circle with a cap line
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, node.size / 2, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${Math.max(baseNodeAlpha, node.glow * 0.2)})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(node.x - node.size, node.y);
          ctx!.lineTo(node.x + node.size, node.y);
          ctx!.stroke();
        } else {
          // Junction: small circle
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, node.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        }

        // Spawn ember particles from hot nodes
        if (node.glow > 0.7 && Math.random() < 0.15 && particles.length < 20) {
          const count = 1 + Math.floor(Math.random() * 2);
          for (let p = 0; p < count; p++) {
            particles.push({
              x: node.x + (Math.random() - 0.5) * node.size,
              y: node.y,
              vy: -(0.3 + Math.random() * 0.5),
              alpha: 0.6 + Math.random() * 0.3,
              size: 1 + Math.random(),
              life: 1,
            });
          }
        }

        // Decay glow
        node.glow *= 0.94;
      }

      // --- Update and draw current flows ---
      flows = flows.filter((flow) => {
        const seg = segments[flow.segmentIdx];
        flow.progress += flow.speed;

        // Light up the segment as current passes
        seg.glow = Math.max(seg.glow, flow.progress * 0.9);

        // Calculate current position along the L-shaped path
        const fromNode = nodes[flow.forward ? seg.from : seg.to];
        const toNode = nodes[flow.forward ? seg.to : seg.from];
        let px: number, py: number;

        if (seg.orientation === "h") {
          // Horizontal first, then vertical
          const midX = toNode.x;
          const hDist = Math.abs(midX - fromNode.x);
          const vDist = Math.abs(toNode.y - fromNode.y);
          const totalDist = hDist + vDist;
          const traveled = flow.progress * totalDist;

          if (traveled <= hDist) {
            px = fromNode.x + (midX - fromNode.x) * (traveled / hDist);
            py = fromNode.y;
          } else {
            px = midX;
            const vProgress = (traveled - hDist) / (vDist || 1);
            py = fromNode.y + (toNode.y - fromNode.y) * Math.min(vProgress, 1);
          }
        } else {
          // Vertical first, then horizontal
          const midY = toNode.y;
          const vDist = Math.abs(midY - fromNode.y);
          const hDist = Math.abs(toNode.x - fromNode.x);
          const totalDist = vDist + hDist;
          const traveled = flow.progress * totalDist;

          if (traveled <= vDist) {
            px = fromNode.x;
            py = fromNode.y + (midY - fromNode.y) * (traveled / vDist);
          } else {
            py = midY;
            const hProgress = (traveled - vDist) / (hDist || 1);
            px = fromNode.x + (toNode.x - fromNode.x) * Math.min(hProgress, 1);
          }
        }

        // Draw current head
        const flowAlpha = isDark ? 0.7 : 0.45;
        ctx!.save();
        ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${flowAlpha * 0.6})`;
        ctx!.shadowBlur = 8;
        ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${flowAlpha})`;
        ctx!.beginPath();
        ctx!.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        if (flow.progress >= 1) {
          // Current reached destination
          const destIdx = flow.forward ? seg.to : seg.from;
          nodes[destIdx].glow = 1.0;

          // Propagation: 40% chance to continue
          if (flow.hopsRemaining > 0 && Math.random() < 0.4) {
            const destNode = nodes[destIdx];
            const nextSegments = destNode.connections.filter((si) => si !== flow.segmentIdx);
            if (nextSegments.length > 0) {
              const nextSegIdx = nextSegments[Math.floor(Math.random() * nextSegments.length)];
              const nextSeg = segments[nextSegIdx];
              flows.push({
                segmentIdx: nextSegIdx,
                progress: 0,
                speed: flow.speed,
                hopsRemaining: flow.hopsRemaining - 1,
                forward: nextSeg.from === destIdx,
              });
            }
          }
          return false;
        }
        return true;
      });

      // --- Update and draw ember particles ---
      particles = particles.filter((p) => {
        p.y += p.vy;
        p.life -= 1 / 60; // ~60 frames
        p.alpha *= 0.97;
        p.size *= 0.99;

        if (p.life <= 0 || p.alpha < 0.01) return false;

        const pAlpha = p.alpha * (isDark ? 1 : 0.6);
        ctx!.save();
        ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${pAlpha})`;
        ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${pAlpha * 0.5})`;
        ctx!.shadowBlur = 3;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        return true;
      });

      animationId = requestAnimationFrame(draw);
    }

    resize();
    generateCircuit();
    draw();

    const handleResize = () => {
      resize();
      generateCircuit();
      flows = [];
      particles = [];
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
