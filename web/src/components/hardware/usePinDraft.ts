import { useEffect, useState } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { getClientForSession } from "../../api/sessionClient";
import { DEFAULT_PIN, type Component } from "./pinMeta";

/** A card's pin selection, held until its upload button pushes it to the board. */
export interface PinDraft {
  component: Component;
  currentPin: number;
  draft: number;
  setDraft: (pin: number) => void;
  /** The pin can only be changed while the session is connected. */
  isEditable: boolean;
  isDirty: boolean;
  /** Push the draft pin to the board. Resolves to an error message, or null on success. */
  sendPin: () => Promise<string | null>;
}

/** Describe a failed setPins call in one line. */
function describePinError(err: unknown): string {
  const e = err as { body?: unknown; message?: string };
  const detail = (e?.body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return e?.message ?? "Failed to set pin.";
}

/** Draft pin state for a card. Returns null for a card without a pin. */
export function usePinDraft(sessionId: string, component: Component | undefined): PinDraft | null {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setPinOverrides = useSessionStore((s) => s.setPinOverrides);
  const stored = (session?.pinOverrides as Record<string, number> | undefined) ?? {};
  const currentPin = component ? (stored[component] ?? DEFAULT_PIN[component]) : 0;
  const [draft, setDraft] = useState<number>(currentPin);

  // Follow the saved pin when it changes outside this card (hydration on connect, a preset).
  useEffect(() => {
    setDraft(currentPin);
  }, [currentPin]);

  if (!component) return null;
  const isEditable = session?.state === "connected";

  const sendPin = async (): Promise<string | null> => {
    try {
      const result = await getClientForSession(sessionId)?.setPins(sessionId, { [component]: draft });
      if (!result) return "Backend client unavailable.";
      setPinOverrides(sessionId, result.applied);
      return result.errors?.find((e) => e.component === component)?.error ?? null;
    } catch (err) {
      return describePinError(err);
    }
  };

  return { component, currentPin, draft, setDraft, isEditable, isDirty: isEditable && draft !== currentPin, sendPin };
}
