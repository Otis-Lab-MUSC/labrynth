import { useSessionStore } from "../../store/useSessionStore";
import { getClientForSession } from "../../api/sessionClient";
import { DEFAULT_PIN, type Component } from "./pinMeta";

/** A card's pin. Picking a pin sends it to the board at once; there is no held draft. */
export interface PinDraft {
  component: Component;
  currentPin: number;
  /** The pin can only be changed while the session is connected. */
  isEditable: boolean;
  /** Push a pin to the board. Resolves to an error message, or null on success. */
  sendPin: (pin: number) => Promise<string | null>;
}

/** Describe a failed setPins call in one line. */
function describePinError(err: unknown): string {
  const e = err as { body?: unknown; message?: string };
  const detail = (e?.body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return e?.message ?? "Failed to set pin.";
}

/** Pin state for a card. Returns null for a card without a pin. */
export function usePinDraft(sessionId: string, component: Component | undefined): PinDraft | null {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setPinOverrides = useSessionStore((s) => s.setPinOverrides);
  if (!component) return null;
  const stored = (session?.pinOverrides as Record<string, number> | undefined) ?? {};
  const currentPin = stored[component] ?? DEFAULT_PIN[component];
  const isEditable = session?.state === "connected";

  const sendPin = async (pin: number): Promise<string | null> => {
    try {
      const result = await getClientForSession(sessionId)?.setPins(sessionId, { [component]: pin });
      if (!result) return "Backend client unavailable.";
      setPinOverrides(sessionId, result.applied);
      return result.errors?.find((e) => e.component === component)?.error ?? null;
    } catch (err) {
      return describePinError(err);
    }
  };

  return { component, currentPin, isEditable, sendPin };
}
