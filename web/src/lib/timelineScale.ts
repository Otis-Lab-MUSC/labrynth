// Fixed time scale for the event timeline. Erasable TS only: node --test imports this directly.

export const TIMELINE_PX_PER_SEC = 10;
export const TIMELINE_TICK_SEC = 10;
export const TIMELINE_LABEL_SEC = 30;

export interface TimelineTick {
  t: number;
  label: boolean;
}

export function fixedTicks(spanSec: number): TimelineTick[] {
  if (spanSec <= 0) return [{ t: 0, label: true }];
  const count = Math.floor(spanSec / TIMELINE_TICK_SEC);
  const ticks: TimelineTick[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i * TIMELINE_TICK_SEC;
    ticks.push({ t, label: t % TIMELINE_LABEL_SEC === 0 });
  }
  return ticks;
}

export function formatTickLabel(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
