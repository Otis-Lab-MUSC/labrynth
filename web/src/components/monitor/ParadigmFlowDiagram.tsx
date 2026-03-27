import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "../../store/useThemeStore";
import type { HardwareUiState, LaserUiState } from "../../types";

// ─── Types ───────────────────────────────────────────────────────────

type LaneId = "iti" | "lever" | "cue" | "trace" | "pump" | "laser" | "timeout";

interface TimeBar {
  lane: LaneId;
  startMs: number;
  endMs: number;
  label: string;
  sublabel?: string;
  dashed?: boolean;
}

interface CausalArrow {
  fromLane: LaneId;
  fromEndMs: number;
  toLanes: LaneId[];
  toStartMs: number;
  label: string;
}

interface TraceAnnotation {
  startMs: number;
  endMs: number;
  label: string;
}

interface TimeoutAnnotation {
  startMs: number;
  endMs: number;
  note: string;
}

interface TrialTimeline {
  title: string;
  bars: TimeBar[];
  arrows: CausalArrow[];
  traces: TraceAnnotation[];
  timeouts: TimeoutAnnotation[];
  loopLabel?: string;
}

// ─── Colors & Constants ──────────────────────────────────────────────

const COLORS: Record<LaneId, { dark: string; light: string }> = {
  lever:   { dark: "#00ff41", light: "#16a34a" },
  cue:     { dark: "#ffaa00", light: "#d97706" },
  pump:    { dark: "#00aaff", light: "#2563eb" },
  laser:   { dark: "#ff4444", light: "#dc2626" },
  timeout: { dark: "#888888", light: "#6b7280" },
  iti:     { dark: "#a855f7", light: "#7c3aed" },
  trace:   { dark: "#6b7280", light: "#9ca3af" },
};

const LANE_LABELS: Record<LaneId, string> = {
  iti: "ITI",
  lever: "LEVER",
  cue: "CUE",
  trace: "TRACE",
  pump: "PUMP",
  laser: "LASER",
  timeout: "TIMEOUT",
};

const LANE_ORDER: LaneId[] = ["iti", "lever", "cue", "trace", "pump", "laser", "timeout"];

const LABEL_W = 70;
const LANE_H = 38;
const LANE_GAP = 4;
const BAR_H = 26;
const HEADER_H = 8;
const FOOTER_H = 28;
const MIN_BAR_PX = 36;
const TICK_H = 6;
const FONT_SIZE = 10;
const SUB_FONT_SIZE = 8.5;
const ANNO_FONT_SIZE = 8;
const OVERFLOW_THRESHOLD = 50;

// ─── Layout ──────────────────────────────────────────────────────────

interface LayoutResult {
  activeLanes: LaneId[];
  laneY: Map<LaneId, number>;
  totalMs: number;
  sqrtTotal: number;
  plotW: number;
  totalW: number;
  totalH: number;
  timeAxisY: number;
}

function computeLayout(timeline: TrialTimeline, containerW: number): LayoutResult {
  const laneSet = new Set<LaneId>();
  for (const bar of timeline.bars) laneSet.add(bar.lane);
  const activeLanes = LANE_ORDER.filter((l) => laneSet.has(l));

  const laneY = new Map<LaneId, number>();
  let cy = HEADER_H;
  for (let i = 0; i < activeLanes.length; i++) {
    laneY.set(activeLanes[i], cy);
    cy += LANE_H + (i < activeLanes.length - 1 ? LANE_GAP : 0);
  }

  const timeAxisY = cy + 4;
  const totalH = timeAxisY + FOOTER_H;

  const totalMs = Math.max(...timeline.bars.map((b) => b.endMs), 1);
  const plotW = containerW - LABEL_W - 8;
  const sqrtTotal = Math.sqrt(totalMs);
  const totalW = containerW;

  return { activeLanes, laneY, totalMs, sqrtTotal, plotW, totalW, totalH, timeAxisY };
}

function msToX(ms: number, sqrtTotal: number, plotW: number): number {
  return LABEL_W + Math.max((Math.sqrt(ms) / sqrtTotal) * plotW, 0);
}

function barWidth(startMs: number, endMs: number, sqrtTotal: number, plotW: number): number {
  return Math.max(msToX(endMs, sqrtTotal, plotW) - msToX(startMs, sqrtTotal, plotW), MIN_BAR_PX);
}

// ─── Time Ticks ──────────────────────────────────────────────────────

function computeTicks(totalMs: number): number[] {
  if (totalMs <= 0) return [0];
  const intervals = [100, 250, 500, 1000, 2500, 5000, 10000, 30000];
  const targetCount = 5;
  let interval = intervals[0];
  for (const iv of intervals) {
    if (totalMs / iv <= targetCount + 2) {
      interval = iv;
      break;
    }
    interval = iv;
  }
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs; t += interval) ticks.push(t);
  if (ticks[ticks.length - 1] < totalMs) ticks.push(totalMs);
  return ticks;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  return `${ms}ms`;
}

// ─── Laser Helpers ──────────────────────────────────────────────────

function isLaserInChain(mode: LaserUiState["mode"]): boolean {
  return mode !== "independent";
}

function laserAppliesToTrial(mode: LaserUiState["mode"], trialType: "cs+" | "cs-"): boolean {
  if (mode === "independent") return false;
  if (mode === "contingent" || mode === "cs_both") return true;
  if (mode === "cs_plus") return trialType === "cs+";
  if (mode === "cs_minus") return trialType === "cs-";
  return false;
}

function addIndependentLaserAnnotation(bars: TimeBar[], hw: HardwareUiState): void {
  if (hw.laser.armed && !isLaserInChain(hw.laser.mode)) {
    const totalMs = Math.max(...bars.map((b) => b.endMs), 1);
    bars.push({
      lane: "laser",
      startMs: 0,
      endMs: totalMs,
      label: "INDEPENDENT",
      sublabel: `${hw.laser.frequency}Hz`,
      dashed: true,
    });
  }
}

// ─── Timeline Builders ───────────────────────────────────────────────

interface ParadigmSettings {
  ratio: number;
  step: number;
  interval: number;
  traceInterval: number;
}

function buildFRTimeline(hw: HardwareUiState, ps: ParadigmSettings): TrialTimeline {
  const bars: TimeBar[] = [];
  const arrows: CausalArrow[] = [];
  const traces: TraceAnnotation[] = [];
  const timeouts: TimeoutAnnotation[] = [];

  // Press duration — notional 500ms for visualization
  const pressDur = 500;
  let t = 0;

  bars.push({ lane: "lever", startMs: t, endMs: t + pressDur, label: `PRESS x${ps.ratio}` });
  const pressEnd = t + pressDur;
  t = pressEnd;

  // Chain fires at press end — timeout starts here (concurrent with chain)
  const chainFireMs = t;

  // CUE fires first in the chain (offsetMs=0 from chain fire)
  const cueDuration = hw.primaryCue.duration;
  if (hw.primaryCue.armed) {
    bars.push({ lane: "cue", startMs: t, endMs: t + cueDuration, label: "CUE", sublabel: `${cueDuration}ms` });
  }
  // Advance past cue duration (firmware uses cue duration offset even if disarmed)
  t += cueDuration;

  // Trace interval between CUE end and PUMP/LASER start
  if (ps.traceInterval > 0) {
    traces.push({ startMs: t, endMs: t + ps.traceInterval, label: `${ps.traceInterval}ms trace` });
    t += ps.traceInterval;
  }

  // PUMP and LASER fire simultaneously after cue duration + trace
  const rewardStart = t;
  const rewardLanes: LaneId[] = [];

  if (hw.primaryPump.armed) {
    bars.push({ lane: "pump", startMs: t, endMs: t + hw.primaryPump.duration, label: "INFUSION", sublabel: `${hw.primaryPump.duration}ms` });
    rewardLanes.push("pump");
  }
  if (hw.laser.armed && isLaserInChain(hw.laser.mode)) {
    bars.push({ lane: "laser", startMs: t, endMs: t + hw.laser.duration, label: "LASER", sublabel: `${hw.laser.duration}ms` });
    rewardLanes.push("laser");
  }

  // Causal arrows reflecting chain order
  if (hw.primaryCue.armed && rewardLanes.length > 0) {
    // Two arrows: press → cue, cue → pump/laser
    arrows.push({ fromLane: "lever", fromEndMs: pressEnd, toLanes: ["cue"], toStartMs: chainFireMs, label: "press → cue" });
    const rewardLabel = rewardLanes.map((l) => LANE_LABELS[l].toLowerCase()).join(" + ");
    arrows.push({ fromLane: "cue", fromEndMs: chainFireMs + cueDuration, toLanes: rewardLanes, toStartMs: rewardStart, label: `cue → ${rewardLabel}` });
  } else if (hw.primaryCue.armed) {
    // Only cue, no pump/laser
    arrows.push({ fromLane: "lever", fromEndMs: pressEnd, toLanes: ["cue"], toStartMs: chainFireMs, label: "press → cue" });
  } else if (rewardLanes.length > 0) {
    // CUE disarmed — press directly triggers pump/laser (offset still applies in firmware)
    const rewardLabel = rewardLanes.map((l) => LANE_LABELS[l].toLowerCase()).join(" + ");
    arrows.push({ fromLane: "lever", fromEndMs: pressEnd, toLanes: rewardLanes, toStartMs: rewardStart, label: `press → ${rewardLabel}` });
  }

  // Timeout starts at chain fire time (concurrent with CUE), not after rewards
  const leverTimeout = hw.rhLever.armed ? hw.rhLever.timeout : hw.lhLever.timeout;
  if (leverTimeout > 0) {
    bars.push({ lane: "timeout", startMs: chainFireMs, endMs: chainFireMs + leverTimeout, label: "TIMEOUT", sublabel: `${leverTimeout}ms`, dashed: true });
    timeouts.push({ startMs: chainFireMs, endMs: chainFireMs + leverTimeout, note: "lever locked" });
  }

  return { title: "Fixed Ratio Trial", bars, arrows, traces, timeouts };
}

function buildPRTimeline(hw: HardwareUiState, ps: ParadigmSettings): TrialTimeline {
  const tl = buildFRTimeline(hw, ps);
  tl.title = "Progressive Ratio Trial";
  tl.loopLabel = `ratio += ${ps.step}`;
  const pressBar = tl.bars.find((b) => b.lane === "lever");
  if (pressBar) pressBar.sublabel = `ratio += ${ps.step}`;
  return tl;
}

function buildVITimeline(hw: HardwareUiState, ps: ParadigmSettings): TrialTimeline {
  const frTl = buildFRTimeline(hw, ps);

  const viDur = ps.interval || 5000;
  const bars: TimeBar[] = [
    { lane: "iti", startMs: 0, endMs: viDur, label: "VI INTERVAL", sublabel: `~${viDur}ms`, dashed: true },
    ...frTl.bars.map((b) => ({ ...b, startMs: b.startMs + viDur, endMs: b.endMs + viDur })),
  ];

  const arrows = frTl.arrows.map((a) => ({
    ...a,
    fromEndMs: a.fromEndMs + viDur,
    toStartMs: a.toStartMs + viDur,
  }));

  const traces = frTl.traces.map((tr) => ({
    ...tr,
    startMs: tr.startMs + viDur,
    endMs: tr.endMs + viDur,
  }));

  const timeouts = frTl.timeouts.map((to) => ({
    ...to,
    startMs: to.startMs + viDur,
    endMs: to.endMs + viDur,
  }));

  return { title: "Variable Interval Trial", bars, arrows, traces, timeouts };
}

function buildOmissionTimeline(hw: HardwareUiState, ps: ParadigmSettings): TrialTimeline {
  const bars: TimeBar[] = [];
  const arrows: CausalArrow[] = [];
  const holdDur = ps.interval || 5000;
  let t = 0;

  bars.push({ lane: "lever", startMs: t, endMs: t + holdDur, label: "NO PRESS", sublabel: `${holdDur}ms` });
  const holdEnd = t + holdDur;
  t = holdEnd;

  const rewardLanes: LaneId[] = [];
  if (hw.primaryCue.armed) {
    bars.push({ lane: "cue", startMs: t, endMs: t + hw.primaryCue.duration, label: "CUE", sublabel: `${hw.primaryCue.duration}ms` });
    rewardLanes.push("cue");
  }
  if (hw.primaryPump.armed) {
    bars.push({ lane: "pump", startMs: t, endMs: t + hw.primaryPump.duration, label: "INFUSION", sublabel: `${hw.primaryPump.duration}ms` });
    rewardLanes.push("pump");
  }
  if (hw.laser.armed && isLaserInChain(hw.laser.mode)) {
    bars.push({ lane: "laser", startMs: t, endMs: t + hw.laser.duration, label: "LASER", sublabel: `${hw.laser.duration}ms` });
    rewardLanes.push("laser");
  }

  if (rewardLanes.length > 0) {
    const rewardLabel = rewardLanes.map((l) => LANE_LABELS[l].toLowerCase()).join(" + ");
    arrows.push({ fromLane: "lever", fromEndMs: holdEnd, toLanes: rewardLanes, toStartMs: t, label: `no press → ${rewardLabel}` });
  }

  return { title: "Omission Trial", bars, arrows, traces: [], timeouts: [], loopLabel: "press resets timer" };
}

function buildPavlovianTimeline(
  trialType: "cs+" | "cs-",
  hw: HardwareUiState,
  pavParams: Record<number, number>,
): TrialTimeline {
  const itiMean = pavParams[216] ?? 30000;
  const cueDuration = pavParams[213] ?? hw.primaryCue.duration;
  const traceInterval = pavParams[214] ?? 0;
  const prob = trialType === "cs+" ? (pavParams[206] ?? 100) : (pavParams[207] ?? 0);
  const cueLabel = trialType === "cs+" ? "CS+ CUE" : "CS\u2212 CUE";
  const pumpDur = hw.primaryPump.duration || 3000;

  const bars: TimeBar[] = [];
  const arrows: CausalArrow[] = [];
  const traceAnnos: TraceAnnotation[] = [];
  let t = 0;

  // ITI
  bars.push({ lane: "iti", startMs: t, endMs: t + itiMean, label: "ITI", sublabel: `~${itiMean}ms`, dashed: true });
  t += itiMean;

  // CS cue
  bars.push({ lane: "cue", startMs: t, endMs: t + cueDuration, label: cueLabel, sublabel: `${cueDuration}ms` });
  const cueEnd = t + cueDuration;
  t = cueEnd;

  // Trace
  let rewardStart = t;
  if (traceInterval > 0) {
    traceAnnos.push({ startMs: t, endMs: t + traceInterval, label: `${traceInterval}ms trace` });
    rewardStart = t + traceInterval;
    t = rewardStart;
  }

  // Pump
  bars.push({ lane: "pump", startMs: t, endMs: t + pumpDur, label: "PUMP", sublabel: `${prob}%` });

  const rewardLanes: LaneId[] = ["pump"];

  // Laser
  if (hw.laser.armed && laserAppliesToTrial(hw.laser.mode, trialType)) {
    const laserDur = hw.laser.duration || 5000;
    if (hw.laser.phase === "cue") {
      bars.push({ lane: "laser", startMs: cueEnd - cueDuration, endMs: cueEnd - cueDuration + laserDur, label: "LASER", sublabel: `${laserDur}ms` });
    } else {
      bars.push({ lane: "laser", startMs: rewardStart, endMs: rewardStart + laserDur, label: "LASER", sublabel: `${laserDur}ms` });
      rewardLanes.push("laser");
    }
  }

  arrows.push({ fromLane: "cue", fromEndMs: cueEnd, toLanes: rewardLanes, toStartMs: rewardStart, label: `${cueLabel.toLowerCase()} → ${rewardLanes.join(" + ")}` });

  const title = trialType === "cs+" ? "CS+ Trial" : "CS\u2212 Trial";
  return { title, bars, arrows, traces: traceAnnos, timeouts: [] };
}

// ─── SVG Renderer ────────────────────────────────────────────────────

function TimelineDiagram({ timeline, isDark, containerW }: { timeline: TrialTimeline; isDark: boolean; containerW: number }) {
  const pick = (c: { dark: string; light: string }) => (isDark ? c.dark : c.light);
  const textFill = isDark ? "#e5e7eb" : "#374151";
  const subtextFill = isDark ? "#9ca3af" : "#6b7280";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  const layout = computeLayout(timeline, containerW);
  const { activeLanes, laneY, sqrtTotal, plotW, totalW, totalH, timeAxisY } = layout;
  const ticks = computeTicks(layout.totalMs);

  return (
    <svg viewBox={`0 0 ${totalW} ${totalH}`} className="w-full" role="img" aria-label={timeline.title}>
      {/* Grid lines */}
      {ticks.map((t) => {
        const x = msToX(t, sqrtTotal, plotW);
        return (
          <line key={`grid-${t}`} x1={x} y1={HEADER_H} x2={x} y2={timeAxisY} stroke={gridColor} strokeWidth={1} />
        );
      })}

      {/* Lane labels */}
      {activeLanes.map((lane) => (
        <text
          key={`label-${lane}`}
          x={LABEL_W - 8}
          y={laneY.get(lane)! + LANE_H / 2}
          textAnchor="end"
          dominantBaseline="central"
          fill={pick(COLORS[lane])}
          fontSize={8}
          fontFamily="var(--font-body)"
          fontWeight={600}
          opacity={0.8}
        >
          {LANE_LABELS[lane]}
        </text>
      ))}

      {/* Bars */}
      {timeline.bars.map((bar, i) => {
        const x = msToX(bar.startMs, sqrtTotal, plotW);
        const w = barWidth(bar.startMs, bar.endMs, sqrtTotal, plotW);
        const ly = laneY.get(bar.lane)!;
        const y = ly + (LANE_H - BAR_H) / 2;
        const color = pick(COLORS[bar.lane]);
        const fillBg = isDark ? `${color}18` : `${color}20`;
        const textFits = w >= OVERFLOW_THRESHOLD;

        return (
          <g key={`bar-${i}`}>
            <rect
              x={x} y={y} width={w} height={BAR_H}
              rx={3} ry={3}
              fill={fillBg}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={bar.dashed ? "4 2" : undefined}
            />
            {textFits ? (
              <>
                <text
                  x={x + w / 2}
                  y={y + (bar.sublabel ? BAR_H / 2 - 4 : BAR_H / 2)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={color}
                  fontSize={FONT_SIZE}
                  fontFamily="var(--font-body)"
                  fontWeight={600}
                >
                  {bar.label}
                </text>
                {bar.sublabel && (
                  <text
                    x={x + w / 2}
                    y={y + BAR_H / 2 + 6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={subtextFill}
                    fontSize={SUB_FONT_SIZE}
                    fontFamily="var(--font-body)"
                  >
                    {bar.sublabel}
                  </text>
                )}
              </>
            ) : (
              <text
                x={x + 2}
                y={y - 4}
                textAnchor="start"
                fill={color}
                fontSize={SUB_FONT_SIZE}
                fontFamily="var(--font-body)"
                fontWeight={600}
              >
                {bar.label}{bar.sublabel ? ` ${bar.sublabel}` : ""}
              </text>
            )}
          </g>
        );
      })}

      {/* Causal arrows */}
      {timeline.arrows.map((arrow, i) => {
        const fromX = msToX(arrow.fromEndMs, sqrtTotal, plotW);
        const toX = msToX(arrow.toStartMs, sqrtTotal, plotW);
        const fromY = laneY.get(arrow.fromLane)! + LANE_H / 2;

        // Find vertical span of target lanes
        const targetYs = arrow.toLanes.map((l) => laneY.get(l)! + LANE_H / 2);
        const midTargetY = (Math.min(...targetYs) + Math.max(...targetYs)) / 2;

        const midX = (fromX + toX) / 2;
        const cpY = Math.min(fromY, midTargetY) - 14;

        return (
          <g key={`arrow-${i}`}>
            {/* Curved path from source to target center */}
            <path
              d={`M${fromX},${fromY} C${midX},${cpY} ${midX},${cpY} ${toX},${midTargetY}`}
              fill="none"
              stroke={subtextFill}
              strokeWidth={1}
              strokeDasharray="3 2"
              opacity={0.6}
            />
            {/* Arrowhead */}
            <polygon
              points={`${toX},${midTargetY} ${toX - 4},${midTargetY - 3} ${toX - 4},${midTargetY + 3}`}
              fill={subtextFill}
              opacity={0.6}
            />
            {/* Fan to individual lanes if multiple */}
            {arrow.toLanes.length > 1 && targetYs.map((ty, j) => (
              <line
                key={`fan-${j}`}
                x1={toX} y1={midTargetY}
                x2={toX} y2={ty}
                stroke={subtextFill}
                strokeWidth={0.8}
                strokeDasharray="2 2"
                opacity={0.4}
              />
            ))}
            {/* Label */}
            <text
              x={midX}
              y={cpY - 3}
              textAnchor="middle"
              fill={subtextFill}
              fontSize={ANNO_FONT_SIZE}
              fontFamily="var(--font-body)"
              fontStyle="italic"
              opacity={0.7}
            >
              {arrow.label}
            </text>
          </g>
        );
      })}

      {/* Trace interval brackets */}
      {timeline.traces.map((tr, i) => {
        const x1 = msToX(tr.startMs, sqrtTotal, plotW);
        const x2 = msToX(tr.endMs, sqrtTotal, plotW);
        // Place bracket below the lowest active lane that's near this time range
        const bracketY = timeAxisY - 8;
        const tickDown = 4;

        return (
          <g key={`trace-${i}`}>
            {/* Left tick */}
            <line x1={x1} y1={bracketY} x2={x1} y2={bracketY + tickDown} stroke={pick(COLORS.trace)} strokeWidth={1} opacity={0.6} />
            {/* Horizontal span */}
            <line x1={x1} y1={bracketY + tickDown} x2={x2} y2={bracketY + tickDown} stroke={pick(COLORS.trace)} strokeWidth={1} strokeDasharray="3 2" opacity={0.6} />
            {/* Right tick */}
            <line x1={x2} y1={bracketY} x2={x2} y2={bracketY + tickDown} stroke={pick(COLORS.trace)} strokeWidth={1} opacity={0.6} />
            {/* Label */}
            <text
              x={(x1 + x2) / 2}
              y={bracketY - 2}
              textAnchor="middle"
              fill={pick(COLORS.trace)}
              fontSize={ANNO_FONT_SIZE}
              fontFamily="var(--font-body)"
              fontStyle="italic"
              opacity={0.7}
            >
              {tr.label}
            </text>
          </g>
        );
      })}

      {/* Timeout annotations */}
      {timeline.timeouts.map((to, i) => {
        const x1 = msToX(to.startMs, sqrtTotal, plotW);
        const x2 = msToX(to.endMs, sqrtTotal, plotW);
        const toBarY = laneY.get("timeout");
        if (toBarY === undefined) return null;
        const noteY = toBarY + LANE_H + 2;

        return (
          <text
            key={`to-note-${i}`}
            x={(x1 + x2) / 2}
            y={noteY}
            textAnchor="middle"
            fill={subtextFill}
            fontSize={ANNO_FONT_SIZE}
            fontFamily="var(--font-body)"
            fontStyle="italic"
            opacity={0.5}
          >
            {to.note}
          </text>
        );
      })}

      {/* Loop label (PR) */}
      {timeline.loopLabel && (
        <text
          x={totalW / 2}
          y={HEADER_H - 1}
          textAnchor="middle"
          fill={subtextFill}
          fontSize={7}
          fontFamily="var(--font-body)"
          fontStyle="italic"
          opacity={0.6}
        >
          ↻ {timeline.loopLabel}
        </text>
      )}

      {/* Time axis */}
      <line
        x1={LABEL_W} y1={timeAxisY}
        x2={totalW - 8} y2={timeAxisY}
        stroke={subtextFill}
        strokeWidth={0.5}
        opacity={0.4}
      />
      {ticks.map((t) => {
        const x = msToX(t, sqrtTotal, plotW);
        return (
          <g key={`tick-${t}`}>
            <line x1={x} y1={timeAxisY} x2={x} y2={timeAxisY + TICK_H} stroke={subtextFill} strokeWidth={0.5} opacity={0.4} />
            <text
              x={x}
              y={timeAxisY + TICK_H + 8}
              textAnchor="middle"
              fill={subtextFill}
              fontSize={7}
              fontFamily="var(--font-body)"
              opacity={0.5}
            >
              {formatMs(t)}
            </text>
          </g>
        );
      })}

      {/* Title */}
      <text
        x={totalW / 2}
        y={totalH - 1}
        textAnchor="middle"
        fill={textFill}
        fontSize={7.5}
        fontFamily="var(--font-body)"
        opacity={0.5}
      >
        {timeline.title}
      </text>
    </svg>
  );
}

// ─── Exported Component ──────────────────────────────────────────────

interface ParadigmFlowDiagramProps {
  paradigm: string;
  hardwareUi: HardwareUiState;
  paradigmSettings: { ratio: number; step: number; interval: number; traceInterval: number } | null;
  pavlovianParams: Record<number, number> | null;
}

const DEFAULT_CONTAINER_W = 500;

export function ParadigmFlowDiagram({
  paradigm,
  hardwareUi,
  paradigmSettings,
  pavlovianParams,
}: ParadigmFlowDiagramProps) {
  const isDark = useThemeStore((s) => s.mode) === "dark";
  const p = paradigm.toLowerCase();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(DEFAULT_CONTAINER_W);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setContainerW(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (p === "pavlovian") {
    if (!pavlovianParams) return null;
    const timelines = [
      buildPavlovianTimeline("cs+", hardwareUi, pavlovianParams),
      buildPavlovianTimeline("cs-", hardwareUi, pavlovianParams),
    ];
    for (const tl of timelines) addIndependentLaserAnnotation(tl.bars, hardwareUi);
    return (
      <div ref={containerRef} className="space-y-3">
        {timelines.map((tl, i) => (
          <TimelineDiagram key={i} timeline={tl} isDark={isDark} containerW={containerW} />
        ))}
      </div>
    );
  }

  const ps = paradigmSettings ?? { ratio: 1, step: 1, interval: 0, traceInterval: 0 };

  let timeline: TrialTimeline;
  switch (p) {
    case "fr":
      timeline = buildFRTimeline(hardwareUi, ps);
      break;
    case "pr":
      timeline = buildPRTimeline(hardwareUi, ps);
      break;
    case "vi":
      timeline = buildVITimeline(hardwareUi, ps);
      break;
    case "omission":
      timeline = buildOmissionTimeline(hardwareUi, ps);
      break;
    default:
      return null;
  }

  addIndependentLaserAnnotation(timeline.bars, hardwareUi);

  return (
    <div ref={containerRef}>
      <TimelineDiagram timeline={timeline} isDark={isDark} containerW={containerW} />
    </div>
  );
}
