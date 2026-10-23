import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import type { BehaviorEvent } from "../../types";
import { useContainerWidth } from "../../hooks/useContainerWidth";
import { TIMELINE_PX_PER_SEC, fixedTicks, formatTickLabel } from "../../lib/timelineScale.ts";
import type { EventDevice } from "../../generated/deviceNames";

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
const DEVICE_COLORS: Record<string, string> = {
  LEVER_RH:   "#00ff41",
  LEVER_LH:   "#41ff00",
  CUE_1:      "#ffaa00",
  CUE_2:      "#ffcc44",
  PUMP_1:     "#00aaff",
  PUMP_2:     "#44ccff",
  LICK:       "#ff55ff",
  LASER:      "#ff4444",
  SLM:        "#ff00ff",
  AUX_1:      "#ff2d2d",
  CONTROLLER: "#888888",
  // Bare CUE/PUMP are current level-007 names, not legacy: PavlovianScheduler
  // spells the *primaries* without the _1 suffix the operant Scheduler uses
  // (it still emits CUE_2/PUMP_2), so both spellings are live and paradigm-
  // dependent. See PavlovianScheduler.cpp / Scheduler.cpp LogDeviceActivation.
  CUE:      "#ffaa00",
  PUMP:     "#00aaff",
};

const LEVER_EVENT_COLORS: Record<string, Record<string, string>> = {
  LEVER_RH: {
    ACTIVE_PRESS:   "#00ff41",
    TIMEOUT_PRESS:  "#00aa2e",
    INACTIVE_PRESS: "#666666",
  },
  LEVER_LH: {
    ACTIVE_PRESS:   "#41ff00",
    TIMEOUT_PRESS:  "#2eaa00",
    INACTIVE_PRESS: "#666666",
  },
  // Legacy aliases
  RH_LEVER: {
    ACTIVE_PRESS:   "#00ff41",
    TIMEOUT_PRESS:  "#00aa2e",
    INACTIVE_PRESS: "#666666",
  },
  LH_LEVER: {
    ACTIVE_PRESS:   "#41ff00",
    TIMEOUT_PRESS:  "#2eaa00",
    INACTIVE_PRESS: "#666666",
  },
};

const DEVICE_DISPLAY_NAMES: Record<string, string> = {
  LEVER_RH: "RH Lever",
  LEVER_LH: "LH Lever",
  CUE_1: "Cue 1",
  CUE_2: "Cue 2",
  PUMP_1: "Pump 1",
  PUMP_2: "Pump 2",
  LASER: "Laser",
  LICK: "Lick Circuit",
  SLM: "SLM",
  AUX_1: "Shock Output",
  CONTROLLER: "Controller",
  // See DEVICE_COLORS: bare CUE/PUMP are current, not legacy.
  CUE: "Cue 1",
  PUMP: "Pump 1",
};

// AUX_1 outcomes are told apart by fill, not just hue: SHOCK solid red, SHOCK_OMITTED hollow
// (the draw said no), SHOCK_SUPPRESSED hollow dashed amber (blocked by test mode / safety gate).
const AUX_EVENT_COLORS: Record<string, string> = {
  SHOCK: "#ff2d2d",
  SHOCK_OMITTED: "#ff8a8a",
  SHOCK_SUPPRESSED: "#ffb020",
};

function auxMarkProps(device: string, event: string, color: string) {
  if (device !== "AUX_1") return { fill: color, stroke: undefined, strokeDasharray: undefined };
  if (event === "SHOCK_OMITTED") return { fill: "none", stroke: color, strokeDasharray: undefined };
  if (event === "SHOCK_SUPPRESSED") return { fill: "none", stroke: color, strokeDasharray: "2 2" };
  return { fill: color, stroke: undefined, strokeDasharray: undefined };
}

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

function getDeviceColor(device: string, event?: string): string {
  if (event) {
    const leverEntry = LEVER_EVENT_COLORS[device]?.[event];
    if (leverEntry) return leverEntry;
  }
  if (device === "AUX_1" && event && AUX_EVENT_COLORS[event]) return AUX_EVENT_COLORS[event];
  const entry = DEVICE_COLORS[device];
  if (entry) return entry;
  return "#aaaaaa";
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toFixed(0)}s`;
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
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerRef, containerWidth] = useContainerWidth();

  // Auto-scroll to latest event; pause when user scrolls left, resume at right edge
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef(true);
  const [following, setFollowing] = useState(true);

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
    setFollowing(scrollAnchorRef.current);
  }, []);

  const jumpToLive = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    scrollAnchorRef.current = true;
    setFollowing(true);
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
  const accentRgb = useMemo(() => readAccentRgb(), []);
  const textPrimaryRgb = useMemo(() => readTextPrimaryRgb(), []);

  // Filter out PAVLOV and CONTROLLER events from display (keep them in data for backend auto-stop)
  const displayEvents = events.filter((e) => e.device !== "PAVLOV" && e.device !== "CONTROLLER");

  if (displayEvents.length === 0) {
    return (
      <div className="rounded-lg border border-theme-border bg-panel p-4 text-center text-theme-text/60 font-mono">
        No events yet. Start the program to see data.
      </div>
    );
  }

  // Compute active lanes from unique device names, preserving a stable order
  const deviceOrder: readonly EventDevice[] = ["LEVER_RH", "LEVER_LH", "CUE_1", "CUE_2", "PUMP_1", "PUMP_2", "LICK", "LASER",
                                                "SLM", "AUX_1", "CONTROLLER", "CUE", "PUMP"];
  const activeDevices = new Set(displayEvents.map((e) => e.device));
  const activeLanes: string[] = deviceOrder.filter((d) => activeDevices.has(d));
  // Append any unknown devices
  for (const d of activeDevices) {
    if (!activeLanes.includes(d)) activeLanes.push(d);
  }

  const laneIndex = new Map(activeLanes.map((d, i) => [d, i]));

  // Time range
  const baseTs = Math.min(...displayEvents.map((e) => e.start_timestamp));
  const maxTs = Math.max(...displayEvents.map((e) => e.end_timestamp));
  const maxTime = Math.max((maxTs - baseTs) / 1000, 1);

  // SVG dimensions — fixed time scale; the lanes SVG grows past the panel when data overflows
  const chartHeight = PADDING_TOP + activeLanes.length * (LANE_HEIGHT + LANE_GAP) + TIME_AXIS_HEIGHT;
  const chartWidth = Math.max(containerWidth, maxTime * TIMELINE_PX_PER_SEC + PADDING_RIGHT);
  const pixelsPerSecond = TIMELINE_PX_PER_SEC;

  const ticks = fixedTicks((chartWidth - PADDING_RIGHT) / pixelsPerSecond);

  const axisColor = `rgba(${accentRgb}, 0.3)`;
  const textColor = `rgb(${textPrimaryRgb})`;
  const gridColor = `rgba(${accentRgb}, 0.05)`;

  return (
    <div className="rounded-lg border border-theme-border bg-panel p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-medium text-theme-text">Event Timeline</h3>
        {!following && (
          <button
            type="button"
            className="btn-sm"
            aria-label="Jump to live"
            onClick={jumpToLive}
          >
            Live
          </button>
        )}
      </div>
      <div className="flex">
        <svg
          width={LABEL_WIDTH}
          height={chartHeight}
          className="shrink-0 font-mono"
        >
          {/* Lane labels: fixed column, outside the scroller so they stay visible */}
          {activeLanes.map((device, i) => {
            const y = PADDING_TOP + i * (LANE_HEIGHT + LANE_GAP);
            return (
              <text
                key={device}
                x={LABEL_WIDTH - 8}
                y={y + LANE_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="central"
                fill={getDeviceColor(device)}
                fontSize={11}
                fontFamily="JetBrains Mono, monospace"
              >
                {displayName(device)}
              </text>
            );
          })}
        </svg>

        <div ref={combinedRef} className="min-w-0 flex-1 overflow-x-auto" style={{ position: "relative" }} onScroll={handleScroll}>
          <svg
            ref={svgRef}
            width={chartWidth}
            height={chartHeight}
            className="font-mono"
          >
            {/* Lane backgrounds */}
            {activeLanes.map((device, i) => {
              const y = PADDING_TOP + i * (LANE_HEIGHT + LANE_GAP);
              return (
                <rect
                  key={device}
                  x={0}
                  y={y}
                  width={chartWidth - PADDING_RIGHT}
                  height={LANE_HEIGHT}
                  fill={gridColor}
                  rx={2}
                />
              );
            })}

            {/* Time axis grid lines */}
            {ticks.map(({ t, label }) => {
              const x = t * pixelsPerSecond;
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
                  {label && (
                    <text
                      x={x}
                      y={chartHeight - TIME_AXIS_HEIGHT + 16}
                      textAnchor={t === 0 ? "start" : "middle"}
                      fill={textColor}
                      fontSize={10}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {formatTickLabel(t)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Time axis line */}
            <line
              x1={0}
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
              const x = startSec * pixelsPerSecond;
              const isInstantaneous = event.start_timestamp === event.end_timestamp;
              const color = getDeviceColor(event.device, event.event);
              const mark = auxMarkProps(event.device, event.event, color);
              const markWidth = event.device === "AUX_1" ? MARKER_WIDTH * 2 : MARKER_WIDTH;

              if (isInstantaneous) {
                return (
                  <rect
                    key={idx}
                    x={x - markWidth / 2}
                    y={y}
                    width={markWidth}
                    height={barHeight}
                    fill={mark.fill}
                    stroke={mark.stroke}
                    strokeWidth={mark.stroke ? 1.5 : undefined}
                    strokeDasharray={mark.strokeDasharray}
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
                  fill={mark.fill}
                  stroke={mark.stroke}
                  strokeWidth={mark.stroke ? 1.5 : undefined}
                  strokeDasharray={mark.strokeDasharray}
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
                top: Math.max(0, tooltip.y - 8),
              }}
            >
              <div className="font-semibold" style={{ color: getDeviceColor(tooltip.device, tooltip.event) }}>
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
      </div>

      {/* Color legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-theme-text/70">
        {activeLanes.map((device) => {
          if (LEVER_DEVICES.has(device)) {
            const subtypes = LEVER_EVENT_COLORS[device];
            return Object.entries(subtypes).map(([eventType, colors]) => {
              const color = colors;
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
          const color = getDeviceColor(device);
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
