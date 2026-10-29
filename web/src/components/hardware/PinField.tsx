import { useMemo, useState } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { COMPONENT_KEYS, COMPONENT_REQUIRES_PWM, DEFAULT_PIN, validPinsFor } from "./pinMeta";
import type { PinDraft } from "./usePinDraft";
import { MenuButton } from "./MenuButton";

interface Props {
  sessionId: string;
  pin: PinDraft;
}

/**
 * Inline pin picker in a hardware card's header. While connected it is a menu button of
 * board-valid pins (excluding pins other components hold); picking one sends it to the board.
 * Otherwise it is a read-only "Pin {n}" badge.
 */
export function PinField({ sessionId, pin }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const [error, setError] = useState<string | null>(null);
  const stored = (session?.pinOverrides as Record<string, number> | undefined) ?? {};
  const { component, currentPin, isEditable } = pin;

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
  // Keep the board's pin selectable even if it would otherwise be filtered.
  if (!options.includes(currentPin)) options.unshift(currentPin);

  const handleSelect = async (next: number) => setError(await pin.sendPin(next));

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="text-xs font-mono text-theme-text/60">Pin</span>
      <MenuButton
        value={currentPin}
        options={options.map((p) => ({ value: p, label: String(p) }))}
        onSelect={handleSelect}
        title={COMPONENT_REQUIRES_PWM[component] ? "Pick a pin to send it to the board (PWM-capable pins only)" : "Pick a pin to send it to the board"}
        logId={`pin-${component}`}
        className="h-6 w-16 px-1 py-0 text-xs font-mono"
      />
      {error && <span className="text-xs text-red-500" role="alert">Pin: {error}</span>}
    </span>
  );
}
