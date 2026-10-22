// Board resolution for the Firmware Upload card. Erasable TS only: node --test imports this directly.

export type BoardId = "uno" | "mega";

const BASE_PARADIGMS = ["fr", "pr", "vi", "omission", "pavlovian"];

/** "<name>_lite" firmware is the UNO build; a bare known paradigm is the full Mega build. */
export function boardFromParadigm(paradigm?: string | null): BoardId | null {
  if (!paradigm) return null;
  if (paradigm.endsWith("_lite")) return "uno";
  return BASE_PARADIGMS.includes(paradigm) ? "mega" : null;
}

const asBoard = (b?: string | null): BoardId | null => (b === "uno" || b === "mega" ? b : null);

/** USB detection first, then the board the connect reply reported, then what the running firmware says it is. */
export function resolveBoard(
  detected?: string | null,
  sessionBoard?: string | null,
  paradigm?: string | null,
): BoardId | null {
  return asBoard(detected) ?? asBoard(sessionBoard) ?? boardFromParadigm(paradigm);
}
