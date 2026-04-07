import { useEffect, useRef } from "react";
import { useThemeStore } from "../../store/useThemeStore";

interface SynapseNode {
  x: number;
  y: number;
  radius: number;
  brightness: number;
  fireTimer: number;
  neighbors: number[];
}

interface LightningBolt {
  segments: { x: number; y: number }[];
  age: number;
  maxAge: number;
  width: number;
  branches: LightningBolt[];
}

interface SynapseArc {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  depth: number;
}

function readAccentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  return [0, 200, 220];
}

function generateBoltPath(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  depth: number,
  maxDepth: number,
): { x: number; y: number }[] {
  if (depth >= maxDepth) return [{ x: ax, y: ay }, { x: bx, y: by }];

  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const offset = (Math.random() - 0.5) * len * 0.4;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;

  const left = generateBoltPath(ax, ay, cx, cy, depth + 1, maxDepth);
  const right = generateBoltPath(cx, cy, bx, by, depth + 1, maxDepth);
  return [...left.slice(0, -1), ...right];
}

function spawnBolt(w: number, h: number): LightningBolt {
  const ax = Math.random() * w;
  const ay = Math.random() * h;
  const angle = Math.random() * Math.PI * 2;
  const dist = 200 + Math.random() * 300;
  const bx = ax + Math.cos(angle) * dist;
  const by = ay + Math.sin(angle) * dist;

  const segments = generateBoltPath(ax, ay, bx, by, 0, 4);

  const branches: LightningBolt[] = [];
  if (Math.random() < 0.3) {
    const branchCount = 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branchCount; b++) {
      const segIdx = Math.floor(Math.random() * (segments.length - 1)) + 1;
      const origin = segments[segIdx];
      const branchAngle = Math.random() * Math.PI * 2;
      const branchDist = dist * (0.3 + Math.random() * 0.3);
      const bex = origin.x + Math.cos(branchAngle) * branchDist;
      const bey = origin.y + Math.sin(branchAngle) * branchDist;
      branches.push({
        segments: generateBoltPath(origin.x, origin.y, bex, bey, 0, 3),
        age: 0,
        maxAge: 30,
        width: 1 + Math.random() * 0.5,
        branches: [],
      });
    }
  }

  return {
    segments,
    age: 0,
    maxAge: 30,
    width: 1.5 + Math.random(),
    branches,
  };
}

export function StormSynapseBackground() {
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
    let nodes: SynapseNode[] = [];
    let bolts: LightningBolt[] = [];
    let arcs: SynapseArc[] = [];
    let boltTimer = 0;
    const BOLT_INTERVAL_MIN = 120; // ~2s at 60fps
    const BOLT_INTERVAL_MAX = 240; // ~4s
    let nextBoltAt = BOLT_INTERVAL_MIN + Math.random() * (BOLT_INTERVAL_MAX - BOLT_INTERVAL_MIN);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initNodes() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const count = 30 + Math.floor(Math.random() * 11); // 30-40
      nodes = [];
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 2 + Math.random() * 2,
          brightness: 0.1,
          fireTimer: 60 + Math.random() * 120, // 1-3s in frames
          neighbors: [],
        });
      }
      // Compute neighbor lists (within 200px)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < 200) {
            nodes[i].neighbors.push(j);
            nodes[j].neighbors.push(i);
          }
        }
      }
    }

    function fireNode(idx: number, depth: number) {
      const node = nodes[idx];
      node.brightness = 1.0;
      node.fireTimer = 60 + Math.random() * 120;

      if (arcs.length >= 10) return;

      // Pick 1-2 random neighbors to propagate to
      const shuffled = [...node.neighbors].sort(() => Math.random() - 0.5);
      const count = Math.min(1 + Math.floor(Math.random() * 2), shuffled.length);
      for (let i = 0; i < count; i++) {
        arcs.push({
          fromIdx: idx,
          toIdx: shuffled[i],
          progress: 0,
          speed: 0.05 + Math.random() * 0.02,
          depth,
        });
      }
    }

    function drawBolt(
      bolt: LightningBolt,
      ar: number,
      ag: number,
      ab: number,
      parentAlpha: number,
    ) {
      const fade = Math.pow(1 - bolt.age / bolt.maxAge, 2);
      const alpha = fade * parentAlpha;
      if (alpha < 0.01) return;

      ctx!.save();
      ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha * 0.6})`;
      ctx!.lineWidth = bolt.width;
      ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${alpha * 0.4})`;
      ctx!.shadowBlur = 8 + Math.random() * 4;
      ctx!.beginPath();
      ctx!.moveTo(bolt.segments[0].x, bolt.segments[0].y);
      for (let i = 1; i < bolt.segments.length; i++) {
        ctx!.lineTo(bolt.segments[i].x, bolt.segments[i].y);
      }
      ctx!.stroke();
      ctx!.restore();

      for (const branch of bolt.branches) {
        drawBolt(branch, ar, ag, ab, alpha * 0.6);
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

      // --- Lightning Bolts ---
      boltTimer++;
      if (boltTimer >= nextBoltAt && bolts.length < 3) {
        bolts.push(spawnBolt(w, h));
        boltTimer = 0;
        nextBoltAt = BOLT_INTERVAL_MIN + Math.random() * (BOLT_INTERVAL_MAX - BOLT_INTERVAL_MIN);
      }

      bolts = bolts.filter((bolt) => {
        bolt.age++;
        for (const branch of bolt.branches) branch.age++;
        drawBolt(bolt, ar, ag, ab, isDark ? 1 : 0.6);
        return bolt.age < bolt.maxAge;
      });

      // --- Synapse Nodes ---
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Spontaneous firing
        node.fireTimer--;
        if (node.fireTimer <= 0) {
          fireNode(i, 0);
        }

        // Brightness decay (~400ms = 24 frames)
        if (node.brightness > 0.1) {
          node.brightness *= 0.92;
          if (node.brightness < 0.1) node.brightness = 0.1;
        }

        // Render node
        const baseAlpha = isDark ? 0.12 : 0.06;
        const glowAlpha = node.brightness * (isDark ? 0.5 : 0.3);

        if (node.brightness > 0.15) {
          // Bright fired state with radial gradient
          ctx!.save();
          const grad = ctx!.createRadialGradient(
            node.x, node.y, 0,
            node.x, node.y, node.radius * 3,
          );
          grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, ${glowAlpha})`);
          grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0)`);
          ctx!.fillStyle = grad;
          ctx!.beginPath();
          ctx!.arc(node.x, node.y, node.radius * 3, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }

        // Base dot
        ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${Math.max(baseAlpha, glowAlpha)})`;
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      // --- Synapse Arcs ---
      arcs = arcs.filter((arc) => {
        arc.progress += arc.speed;
        if (arc.progress >= 1) {
          // Propagate to target node (max depth 2)
          if (arc.depth < 2) {
            fireNode(arc.toIdx, arc.depth + 1);
          } else {
            nodes[arc.toIdx].brightness = 1.0;
            nodes[arc.toIdx].fireTimer = 60 + Math.random() * 120;
          }
          return false;
        }

        const from = nodes[arc.fromIdx];
        const to = nodes[arc.toIdx];
        const px = from.x + (to.x - from.x) * arc.progress;
        const py = from.y + (to.y - from.y) * arc.progress;
        const arcAlpha = isDark ? 0.5 : 0.3;

        // Draw arc line (partial)
        ctx!.save();
        ctx!.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${arcAlpha * 0.3})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(from.x, from.y);
        ctx!.lineTo(px, py);
        ctx!.stroke();

        // Draw traveling dot
        ctx!.shadowColor = `rgba(${ar}, ${ag}, ${ab}, ${arcAlpha})`;
        ctx!.shadowBlur = 6;
        ctx!.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${arcAlpha})`;
        ctx!.beginPath();
        ctx!.arc(px, py, 2, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();

        return true;
      });

      animationId = requestAnimationFrame(draw);
    }

    resize();
    initNodes();
    draw();

    const handleResize = () => {
      resize();
      initNodes();
      bolts = [];
      arcs = [];
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
