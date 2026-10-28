import { useMemo, useState } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { COMPONENT_KEYS, COMPONENT_REQUIRES_PWM, DEFAULT_PIN, validPinsFor } from "./pinMeta";
import type { PinDraft } from "./usePinDraft";
import { UploadIconButton } from "./UploadIconButton";

interface Props {
  sessionId: string;
  pin: PinDraft;
}

/**
 * Inline pin selector in a hardware card's header. While connected it is a select of
 * board-valid pins (excluding pins other components hold) with its own upload button.
 * Otherwise it is a read-only "Pin {n}" badge.
 */
export function PinField({ sessionId, pin }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = (session?.pinOverrides as Record<string, number> | undefined) ?? {};
  const { component, currentPin, draft, setDraft, isEditable, isDirty } = pin;

  // Pins claimed by other components in the saved store, so a collision cannot be picked.
  const claimedByOther = useMemo(() => {
    const out = new Set<number>();
    for (const k of COMPONENT_KEYS) {
      if (k !== component) out.add(stored[k] ?? DEFAULT_PIN[k]);
    }
    return out;
  }, [stored, component]);

  if (!session) return null;

  if (!isEditable) {
    return (
      <span className="text-xs font-mono text-theme-text/40" title="Connect a device to reassign this pin">
        Pin {currentPin}
      </span>
    );
  }

  const options = validPinsFor(component, session.board, claimedByOther);
  // Keep the saved and draft pins selectable even if they would otherwise be filtered.
  if (!options.includes(currentPin)) options.unshift(currentPin);
  if (!options.includes(draft)) options.unshift(draft);

  const handleUpload = async () => {
    setSending(true);
    const err = await pin.sendPin();
    setSending(false);
    setError(err);
  };

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="text-xs font-mono text-theme-text/60">Pin</span>
      <select
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        title={COMPONENT_REQUIRES_PWM[component] ? "PWM-capable pins only" : undefined}
        className="input-base h-6 w-16 px-1 py-0 text-xs font-mono"
      >
        {options.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <UploadIconButton
        onClick={handleUpload}
        disabled={!isDirty || sending}
        title={isDirty ? `Upload pin ${draft} to the board` : `Pin ${currentPin} is on the board`}
        tone={isDirty ? "default" : "sent"}
        sending={sending}
      />
      {error && <span className="text-xs text-red-500" role="alert">Pin: {error}</span>}
    </span>
  );
}
