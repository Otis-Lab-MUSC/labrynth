// Shock event counting for the live stats. Erasable TS only: node --test imports this directly.

/** Delivered shocks only; SHOCK_OMITTED and SHOCK_SUPPRESSED never reach the count. */
export function countShocks(events: ReadonlyArray<{ device: string; event: string }>): number {
  let n = 0;
  for (const e of events) {
    if (e.device === "AUX_1" && e.event === "SHOCK") n++;
  }
  return n;
}

/** A jump of more than 2 is a recovery backfill after reconnect, not a live shock. */
export function shouldJolt(prev: number, next: number, running: boolean): boolean {
  return running && next > prev && next - prev <= 2;
}

/** How long the progress mouse stays in its "shocked" state after a delivered shock. */
export const SHOCK_ANIM_MS = 900;
