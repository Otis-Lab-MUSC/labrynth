import { useThemeStore } from "../../../store/useThemeStore";

const COLORS = {
  lever:   { dark: "#00ff41", light: "#16a34a" },
  cue:     { dark: "#ffaa00", light: "#d97706" },
  pump:    { dark: "#00aaff", light: "#2563eb" },
  laser:   { dark: "#ff4444", light: "#dc2626" },
  timeout: { dark: "#888888", light: "#6b7280" },
} as const;

interface Props {
  compact?: boolean;
}

export function FR1FlowDiagram({ compact = false }: Props) {
  const isDark = useThemeStore((s) => s.mode) === "dark";
  const pick = (c: { dark: string; light: string }) => isDark ? c.dark : c.light;

  const textFill = isDark ? "#e5e7eb" : "#374151";
  const subtextFill = isDark ? "#9ca3af" : "#6b7280";
  const arrowFill = isDark ? "#6b7280" : "#9ca3af";
  const h = compact ? 72 : 88;
  const blockY = compact ? 10 : 16;
  const blockH = compact ? 32 : 36;
  const labelY = blockY + blockH / 2 + 1;
  const durY = blockY + blockH + (compact ? 12 : 16);

  // Layout: 5 blocks with arrows between them
  // [PRESS 60] ->[CUE 100] ->[PUMP+LASER 140] ->[TIMEOUT 120] ->[AVAILABLE 80]
  const gap = 6;
  const arrowW = 16;
  const blocks = [
    { label: "PRESS",   dur: "",             w: 60,  color: COLORS.lever },
    { label: "CUE",     dur: "1600 ms",      w: 90,  color: COLORS.cue },
    { label: "PUMP",    dur: "2000 ms",      w: 80,  color: COLORS.pump },
    { label: "LASER",   dur: "5000 ms",      w: 80,  color: COLORS.laser },
    { label: "TIMEOUT", dur: "20 000 ms",    w: 110, color: COLORS.timeout },
    { label: "READY",   dur: "",             w: 60,  color: COLORS.lever },
  ];

  // Compute x positions
  let cx = 4;
  const positions: { x: number; w: number }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    positions.push({ x: cx, w: blocks[i].w });
    cx += blocks[i].w + (i < blocks.length - 1 ? gap + arrowW + gap : 0);
  }
  const totalW = cx + 4;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${h}`}
      className="w-full"
      role="img"
      aria-label="FR1 reward chain: Press, Cue 1600ms, Pump 2000ms, Laser 5000ms, Timeout 20000ms, Ready"
    >
      {blocks.map((block, i) => {
        const { x, w } = positions[i];
        const fill = pick(block.color);
        const fillBg = isDark ? `${fill}18` : `${fill}20`;
        return (
          <g key={block.label + i}>
            {/* Block rect */}
            <rect
              x={x} y={blockY} width={w} height={blockH}
              rx={4} ry={4}
              fill={fillBg}
              stroke={fill}
              strokeWidth={1.5}
            />
            {/* Label */}
            <text
              x={x + w / 2} y={labelY}
              textAnchor="middle"
              dominantBaseline="central"
              fill={fill}
              fontSize={compact ? 8.5 : 9.5}
              fontFamily="var(--font-body)"
              fontWeight={600}
            >
              {block.label}
            </text>
            {/* Duration */}
            {block.dur && (
              <text
                x={x + w / 2} y={durY}
                textAnchor="middle"
                fill={subtextFill}
                fontSize={compact ? 7 : 8}
                fontFamily="var(--font-body)"
              >
                {block.dur}
              </text>
            )}
            {/* Arrow to next block */}
            {i < blocks.length - 1 && (
              <g>
                <line
                  x1={x + w + gap}
                  y1={labelY}
                  x2={positions[i + 1].x - gap - 4}
                  y2={labelY}
                  stroke={arrowFill}
                  strokeWidth={1.2}
                />
                <polygon
                  points={`${positions[i + 1].x - gap - 4},${labelY - 3} ${positions[i + 1].x - gap},${labelY} ${positions[i + 1].x - gap - 4},${labelY + 3}`}
                  fill={arrowFill}
                />
              </g>
            )}
          </g>
        );
      })}
      {/* Loopback arrow from READY back to PRESS (subtle curved path) */}
      <path
        d={`M ${positions[5].x + positions[5].w / 2} ${blockY - 1}
            Q ${totalW / 2} ${blockY - (compact ? 10 : 14)},
              ${positions[0].x + positions[0].w / 2} ${blockY - 1}`}
        fill="none"
        stroke={arrowFill}
        strokeWidth={0.8}
        strokeDasharray="3 2"
        opacity={0.6}
      />
      {/* Title */}
      {!compact && (
        <text
          x={totalW / 2} y={h - 2}
          textAnchor="middle"
          fill={textFill}
          fontSize={7.5}
          fontFamily="var(--font-body)"
          opacity={0.5}
        >
          FR1 Reward Chain
        </text>
      )}
    </svg>
  );
}
