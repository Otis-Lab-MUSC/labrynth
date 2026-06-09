import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import type { BehaviorEvent } from "../../types";
import { useThemeStore } from "../../store/useThemeStore";
import { useContainerWidth } from "../../hooks/useContainerWidth";

function readAccentRgb(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-accent")
    .trim();
  return raw.split(/\s+/).join(", ");
}

function readTextPrimaryRgb(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-text-primary")
    .trim();
  return raw.split(/\s+/).join(", ");
}

interface Props {
  events: BehaviorEvent[];
}

// Firmware v2.4.x+ names; legacy v2.3.x names kept as aliases so old sessions still render
const DEVICE_COLORS: Record<string, { dark: string; light: string }> = {
  LEVER_RH:   { dark: "#00ff41", light: "#16a34a" },
  LEVER_LH:   { dark: "#41ff00", light: "#65a30d" },
  CUE_1:      { dark: "#ffaa00", light: "#d97706" },
  CUE_2:      { dark: "#ffcc44", light: "#b45309" },
  PUMP_1:     { dark: "#00aaff", light: "#2563eb" },
  PUMP_2:     { dark: "#44ccff", light: "#1d4ed8" },
  LICK:       { dark: "#ff55ff", light: "#c026d3" },
  LASER:      { dark: "#ff4444", light: "#dc2626" },
  SLM:        { dark: "#ff00ff", light: "#9333ea" },
  CONTROLLER: { dark: "#888888", light: "#6b7280" },
  // Legacy aliases (firmware < v2.4.x)
  RH_LEVER: { dark: "#00ff41", light: "#16a34a" },
  LH_LEVER: { dark: "#41ff00", light: "#65a30d" },
  CUE:      { dark: "#ffaa00", light: "#d97706" },
  PUMP:     { dark: "#00aaff", light: "#2563eb" },
};

const LEVER_EVENT_COLORS: Record<string, Record<string, { dark: string; light: string }>> = {
  LEVER_RH: {
    ACTIVE_PRESS:   { dark: "#00ff41", light: "#16a34a" },
    TIMEOUT_PRESS:  { dark: "#00aa2e", light: "#4d7c0f" },
    INACTIVE_PRESS: { dark: "#666666", light: "#9ca3af" },
  },
  LEVER_LH: {
    ACTIVE_PRESS:   { dark: "#41ff00", light: "#65a30d" },
    TIMEOUT_PRESS:  { dark: "#2eaa00", light: "#4d7c0f" },
    INACTIVE_PRESS: { dark: "#666666", light: "#9ca3af" },
  },
  // Legacy aliases
  RH_LEVER: {
    ACTIVE_PRESS:   { dark: "#00ff41", light: "#16a34a" },
    TIMEOUT_PRESS:  { dark: "#00aa2e", light: "#4d7c0f" },
    INACTIVE_PRESS: { dark: "#666666", light: "#9ca3af" },
  },
  LH_LEVER: {
    ACTIVE_PRESS:   { dark: "#41ff00", light: "#65a30d" },
    TIMEOUT_PRESS:  { dark: "#2eaa00", light: "#4d7c0f" },
    INACTIVE_PRESS: { dark: "#666666", light: "#9ca3af" },
  },
};

const DEVICE_DISPLAY_NAMES: Record<string, string> = {
  LEVER_RH: "RH LEVER",
  LEVER_LH: "LH LEVER",
  CUE_1: "CUE 1",
  CUE_2: "CUE 2",
  PUMP_1: "PUMP 1",
  PUMP_2: "PUMP 2",
  LASER: "Laser",
  LICK: "Lick Circuit",
  MICROSCOPE: "Microscope",
  CONTROLLER: "Controller",
  // Legacy firmware labels
  RH_LEVER: "RH LEVER",
  LH_LEVER: "LH LEVER",
  CUE: "CUE 1",
  PUMP: "PUMP 1",
};

const displayName = (raw: string): string => DEVICE_DISPLAY_NAMES[raw] ?? raw;

const LEVER_DEVICES = new Set(Object.keys(LEVER_EVENT_COLORS));

const LANE_HEIGHT = 32;
const LANE_GAP = 4;
const LABEL_WIDTH = 100;
const TIME_AXIS_HEIGHT = 30;
const PADDING_TOP = 8;
const PADDING_RIGHT = 16;
const MIN_BAR_WIDTH = 2;
const MARKER_WIDTH = 3;

function getDeviceColor(device: string, isDark: boolean, event?: string): string {
  if (event) {
    const leverEntry = LEVER_EVENT_COLORS[device]?.[event];
    if (leverEntry) return isDark ? leverEntry.dark : leverEntry.light;
  }
  const entry = DEVICE_COLORS[device];
  if (entry) return isDark ? entry.dark : entry.light;
  return isDark ? "#aaaaaa" : "#9ca3af";
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toFixed(0)}s`;
}

function computeTimeTicks(minTime: number, maxTime: number): number[] {
  const range = maxTime - minTime;
  if (range <= 0) return [0];

  // Choose a nice tick interval
  const rawInterval = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const candidates = [1, 2, 5, 10, 20, 30, 60];
  let interval = candidates[candidates.length - 1] * mag;
  for (const c of candidates) {
    if (c * mag >= rawInterval) {
      interval = c * mag;
      break;
    }
  }
  if (interval < 1) interval = 1;

  const ticks: number[] = [];
  const start = Math.ceil(minTime / interval) * interval;
  for (let t = start; t <= maxTime; t += interval) {
    ticks.push(t);
  }
  if (ticks.length === 0) ticks.push(minTime);
  return ticks;
}

interface TooltipData {
  x: number;
  y: number;
  device: string;
  event: string;
  start: number;
  end: number;
  duration: number;
}

export function EventTimeline({ events }: Props) {
  const isDark = useThemeStore((s) => s.mode) === "dark";
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerRef, containerWidth] = useContainerWidth();

  // Auto-scroll to latest event; pause when user scrolls left, resume at right edge
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef(true);

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      containerRef(node);
    },
    [containerRef]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollAnchorRef.current) return;
    el.scrollLeft = el.scrollWidth;
  }, [events.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollAnchorRef.current = el.scrollWidth - el.scrollLeft - el.clientWidth < 20;
  }, []);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent, event: BehaviorEvent, baseTs: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const startSec = (event.start_timestamp - baseTs) / 1000;
      const endSec = (event.end_timestamp - baseTs) / 1000;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        device: event.device,
        event: event.event,
        start: startSec,
        end: endSec,
        duration: endSec - startSec,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // These MUST be called before any early return (Rules of Hooks)
  const accentRgb = useMemo(() => readAccentRgb(), [isDark]);
  const textPrimaryRgb = useMemo(() => readTextPrimaryRgb(), [isDark]);

  // Filter out PAVLOV events from display (keep them in data for backend auto-stop)
  const displayEvents = events.filter((e) => e.device !== "PAVLOV");

  if (displayEvents.length === 0) {
    return (
      <div className="rounded-lg border border-theme-border bg-panel p-4 text-center text-theme-text/60 font-mono">
        No events yet. Start the program to see data.
      </div>
    );
  }

  // Compute active lanes from unique device names, preserving a stable order
  const deviceOrder = ["LEVER_RH", "LEVER_LH", "CUE_1", "CUE_2", "PUMP_1", "PUMP_2", "LICK", "LASER", "SLM", "CONTROLLER",
                       "RH_LEVER", "LH_LEVER", "CUE", "PUMP"];
  const activeDevices = new Set(displayEvents.map((e) => e.device));
  const activeLanes = deviceOrder.filter((d) => activeDevices.has(d));
  // Append any unknown devices
  for (const d of activeDevices) {
    if (!activeLanes.includes(d)) activeLanes.push(d);
  }

  const laneIndex = new Map(activeLanes.map((d, i) => [d, i]));

  // Time range
  const baseTs = Math.min(...displayEvents.map((e) => e.start_timestamp));
  const maxTs = Math.max(...displayEvents.map((e) => e.end_timestamp));
  const minTime = 0;
  const maxTime = Math.max((maxTs - baseTs) / 1000, 1);

  // SVG dimensions — fill container, scroll when data overflows
  const chartHeight = PADDING_TOP + activeLanes.length * (LANE_HEIGHT + LANE_GAP) + TIME_AXIS_HEIGHT;
  const dataWidth = LABEL_WIDTH + maxTime * 4 + PADDING_RIGHT; // minimum 4px/sec
  const chartWidth = Math.max(containerWidth, dataWidth);
  const pixelsPerSecond = (chartWidth - LABEL_WIDTH - PADDING_RIGHT) / maxTime;

  const ticks = computeTimeTicks(minTime, maxTime);

  const axisColor = isDark ? `rgba(${accentRgb}, 0.3)` : "rgba(0,0,0,0.1)";
  const textColor = `rgb(${textPrimaryRgb})`;
  const gridColor = isDark ? `rgba(${accentRgb}, 0.05)` : "rgba(0,0,0,0.03)";

  return (
    <div className="rounded-lg border border-theme-border bg-panel p-4">
      <h3 className="mb-2 font-medium text-theme-text">Event Timeline</h3>
      <div ref={combinedRef} className="overflow-x-auto" style={{ position: "relative" }} onScroll={handleScroll}>
        <svg
          ref={svgRef}
          width={chartWidth}
          height={chartHeight}
          className="font-mono"
        >
          {/* Lane backgrounds and labels */}
          {activeLanes.map((device, i) => {
            const y = PADDING_TOP + i * (LANE_HEIGHT + LANE_GAP);
            return (
              <g key={device}>
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={chartWidth - LABEL_WIDTH - PADDING_RIGHT}
                  height={LANE_HEIGHT}
                  fill={gridColor}
                  rx={2}
                />
                <text
                  x={LABEL_WIDTH - 8}
                  y={y + LANE_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill={getDeviceColor(device, isDark)}
                  fontSize={11}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {displayName(device)}
                </text>
              </g>
            );
          })}

          {/* Time axis grid lines */}
          {ticks.map((t) => {
            const x = LABEL_WIDTH + (t - minTime) * pixelsPerSecond;
            return (
              <g key={t}>
                <line
                  x1={x}
                  y1={PADDING_TOP}
                  x2={x}
                  y2={chartHeight - TIME_AXIS_HEIGHT}
                  stroke={axisColor}
                  strokeDasharray="2 4"
                />
                <text
                  x={x}
                  y={chartHeight - TIME_AXIS_HEIGHT + 16}
                  textAnchor="middle"
                  fill={textColor}
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatTime(t)}
                </text>
              </g>
            );
          })}

          {/* Time axis line */}
          <line
            x1={LABEL_WIDTH}
            y1={chartHeight - TIME_AXIS_HEIGHT}
            x2={chartWidth - PADDING_RIGHT}
            y2={chartHeight - TIME_AXIS_HEIGHT}
            stroke={axisColor}
          />

          {/* Event bars */}
          {displayEvents.map((event, idx) => {
            const lane = laneIndex.get(event.device);
            if (lane === undefined) return null;
            const y = PADDING_TOP + lane * (LANE_HEIGHT + LANE_GAP) + 2;
            const barHeight = LANE_HEIGHT - 4;
            const startSec = (event.start_timestamp - baseTs) / 1000;
            const endSec = (event.end_timestamp - baseTs) / 1000;
            const x = LABEL_WIDTH + startSec * pixelsPerSecond;
            const isInstantaneous = event.start_timestamp === event.end_timestamp;
            const color = getDeviceColor(event.device, isDark, event.event);

            if (isInstantaneous) {
              return (
                <rect
                  key={idx}
                  x={x - MARKER_WIDTH / 2}
                  y={y}
                  width={MARKER_WIDTH}
                  height={barHeight}
                  fill={color}
                  opacity={0.9}
                  rx={1}
                  onMouseEnter={(e) => handleMouseEnter(e, event, baseTs)}
                  onMouseLeave={handleMouseLeave}
                  style={{ cursor: "pointer" }}
                />
              );
            }

            const rawWidth = (endSec - startSec) * pixelsPerSecond;
            const barWidth = Math.max(rawWidth, MIN_BAR_WIDTH);

            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={color}
                opacity={0.8}
                rx={2}
                onMouseEnter={(e) => handleMouseEnter(e, event, baseTs)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded border border-theme-border bg-panel px-2 py-1 font-mono text-xs shadow-lg"
            style={{
              left: Math.min(tooltip.x + 12, chartWidth - 200),
              top: tooltip.y - 8,
            }}
          >
            <div className="font-semibold" style={{ color: getDeviceColor(tooltip.device, isDark, tooltip.event) }}>
              {displayName(tooltip.device)}
            </div>
            <div className="text-theme-text">{tooltip.event}</div>
            <div className="text-theme-text/60">
              {formatTime(tooltip.start)} &rarr; {formatTime(tooltip.end)}
            </div>
            <div className="text-theme-text/60">
              Duration: {tooltip.duration.toFixed(2)}s
            </div>
          </div>
        )}
      </div>

      {/* Color legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-theme-text/70">
        {activeLanes.map((device) => {
          if (LEVER_DEVICES.has(device)) {
            const subtypes = LEVER_EVENT_COLORS[device];
            return Object.entries(subtypes).map(([eventType, colors]) => {
              const color = isDark ? colors.dark : colors.light;
              const label = `${displayName(device)} ${eventType.replace("_PRESS", "").toLowerCase()}`;
              return (
                <span key={`${device}-${eventType}`} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
              );
            });
          }
          const color = getDeviceColor(device, isDark);
          return (
            <span key={device} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: color }}
              />
              {displayName(device)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
