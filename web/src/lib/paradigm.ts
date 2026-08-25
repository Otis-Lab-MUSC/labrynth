/* Paradigm identity helpers.
 *
 * Boards without two-photon hardware run a "_lite" build of a paradigm — the
 * same schedule, minus Microscope/SLM support (see firmware/CLAUDE.md). The
 * backend reports these as e.g. "pr_lite", so any check asking *which schedule
 * is this* has to compare against the base name, or every lite variant silently
 * falls through to the wrong branch.
 *
 * Note this is only for schedule-shaped questions. Whether a given control is
 * actually available is answered by the session's command list, not by name.
 */

/** Strip a "_lite" suffix, yielding the base paradigm ("pr_lite" -> "pr"). */
export function baseParadigm(paradigm?: string | null): string | undefined {
  return paradigm?.replace(/_lite$/, "") ?? undefined;
}

/** True when the board is running a two-photon-stripped build. */
export function isLiteParadigm(paradigm?: string | null): boolean {
  return !!paradigm?.endsWith("_lite");
}

/** True when `paradigm` is one of `bases`, ignoring any "_lite" suffix. */
export function isParadigm(paradigm: string | null | undefined, ...bases: string[]): boolean {
  const base = baseParadigm(paradigm);
  return base !== undefined && bases.includes(base);
}
