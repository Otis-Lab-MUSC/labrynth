// Pure event -> AUX UI state reducer. Erasable TS only: node --test imports this directly.
// Keeps the UI from showing the shock as armed/configured when the board is not.
import type { AuxUiState } from "../types/index.ts";

export type AuxEvent =
  | { kind: "config"; data: Record<string, unknown> }
  | { kind: "error"; data: Record<string, unknown> }
  | { kind: "disconnect" }
  | { kind: "reconnected" };

const AUX_ARM = 1401;

/** Firmware snake_case echo key -> AuxUiState field, for the SET-able fields. */
const ECHO_FIELDS: Array<[string, keyof AuxUiState]> = [
  ["duration", "duration"],
  ["onset_delay", "onsetDelay"],
  ["mode", "mode"],
  ["probability", "probability"],
  ["block_k", "blockK"],
  ["block_n", "blockN"],
  ["test_fire", "testFire"],
];

const resetBoardState = (aux: AuxUiState): AuxUiState => ({ ...aux, armed: false, configSent: false });

export function auxStateFromEvent(aux: AuxUiState, ev: AuxEvent): AuxUiState {
  switch (ev.kind) {
    case "disconnect":
    case "reconnected":
      return resetBoardState(aux);
    case "config": {
      const d = ev.data;
      // Firmware disarms every device on IDENTIFY and a reflash resets the shock settings.
      if (d.device === "CONTROLLER" && (typeof d.sketch === "string" || typeof d.version === "string")) {
        return resetBoardState(aux);
      }
      if (d.device !== "AUX") return aux;
      let next = aux;
      if (typeof d.armed === "boolean" && d.armed !== aux.armed) next = { ...next, armed: d.armed };
      for (const [key, field] of ECHO_FIELDS) {
        if (d[key] !== undefined && d[key] !== aux[field] && next.configSent) {
          next = { ...next, configSent: false };
        }
      }
      return next;
    }
    case "error": {
      const d = ev.data;
      if (d.device !== "AUX") return aux;
      if (d.error_code === "AUX_UNCONFIGURED") {
        return {
          ...aux,
          armed: d.command === AUX_ARM ? false : aux.armed,
          configSent: false,
          lastError: "Shock refused: board not configured. Press SET.",
        };
      }
      if (d.error_code === "AUX_PIN_CONFLICT") {
        return { ...aux, lastError: `Pin ${String(d.pin)} is used by another device` };
      }
      return aux;
    }
  }
}
