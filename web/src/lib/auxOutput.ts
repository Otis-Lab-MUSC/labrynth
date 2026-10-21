// Pure helpers for the AUX (TTL shock) output. Erasable TS only: node --test imports this directly.

export const AUX_DISARM = 1400;
export const AUX_ARM = 1401;
export const AUX_TEST = 1403;
export const AUX_SET_DURATION = 1472;
export const AUX_SET_ONSET_DELAY = 1477;
export const AUX_SET_MODE = 1480;
export const AUX_SET_PROBABILITY = 1481;
export const AUX_SET_BLOCK_K = 1482;
export const AUX_SET_BLOCK_N = 1483;
export const AUX_SET_SEED = 1484;
export const AUX_SET_TEST_FIRE = 1485;

export interface AuxConfig {
  duration: number;
  onsetDelay: number;
  mode: number;
  probability: number;
  blockK: number;
  blockN: number;
  seed: number;
  testFire: boolean;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export const isValidDuration = (v: unknown) => isInt(v) && v >= 1 && v <= 5000;
export const isValidOnsetDelay = (v: unknown) => isInt(v) && v >= 0;
export const isValidMode = (v: unknown) => v === 0 || v === 1;
export const isValidProbability = (v: unknown) => isInt(v) && v >= 0 && v <= 100;
export const isValidBlockN = (v: unknown) => isInt(v) && v >= 1 && v <= 100;
export const isValidBlockK = (v: unknown, n: number) => isInt(v) && isInt(n) && v >= 0 && v <= n;
export const isValidSeed = (v: unknown) => isInt(v) && v >= 0;

/**
 * Setter commands for the current config, in send order. Never includes arm (1401),
 * disarm (1400) or test (1403): those go out only from explicit, confirmed UI actions.
 * block_n precedes block_k so k is never checked against a stale n.
 */
export function auxCommandsFor(state: AuxConfig): [number, number][] {
  // An untouched block config (N still 0) is not sent in independent mode: firmware would clamp n=0 up to 1.
  const block: [number, number][] = state.mode === 1 || state.blockN !== 0
    ? [[AUX_SET_BLOCK_N, state.blockN], [AUX_SET_BLOCK_K, state.blockK]]
    : [];
  return [
    [AUX_SET_MODE, state.mode],
    [AUX_SET_PROBABILITY, state.probability],
    ...block,
    [AUX_SET_DURATION, state.duration],
    [AUX_SET_ONSET_DELAY, state.onsetDelay],
    [AUX_SET_SEED, state.seed],
    [AUX_SET_TEST_FIRE, state.testFire ? 1 : 0],
  ];
}

export type AuxConfirmAction = "arm" | "test" | "testFire";

export const AUX_CONFIRM: Record<AuxConfirmAction, string> = {
  arm: "Arm the shock output? While armed, this session can deliver electric SHOCKS to the animal. Confirm the animal, the shock settings and the wiring are correct before continuing.",
  test: "Fire one shock test pulse now? This delivers a real SHOCK to any animal connected to the output.",
  testFire: "Allow shock pulses in test mode? With this on, test-mode runs will deliver real SHOCKS to any animal connected to the output.",
};

export const SHOCK_LABEL = "Shock Output";

export const AUX_MODE_HELP: Record<0 | 1, string> = {
  0: "Independent: each reward is shocked with probability P.",
  1: "Block: exactly K shocks in every N rewards, at random positions.",
};

export function blockSummary(k: number, n: number): string {
  if (n < 1) return "Set N and K";
  return `${k} of every ${n} rewards shocked`;
}

export function auxStatusText(armed: boolean): string {
  return armed ? "ARMED: will shock" : "Disarmed: no shock";
}

/** Duration and, in block mode, block N must be set before the output can be armed or tested. */
export function isAuxConfigured(s: Pick<AuxConfig, "duration" | "mode" | "blockN">): boolean {
  return isValidDuration(s.duration) && (s.mode === 0 || isValidBlockN(s.blockN));
}

export function confirmAuxAction(
  action: AuxConfirmAction,
  confirmFn: (message: string) => boolean = globalThis.confirm,
): boolean {
  return confirmFn(AUX_CONFIRM[action]) === true;
}
