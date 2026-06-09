import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../../store/useSessionStore";
import { getClientForSession } from "../../api/sessionClient";
import {
  COMPONENT_KEYS,
  COMPONENT_REQUIRES_PWM,
  DEFAULT_PIN,
  validPinsFor,
  type Component,
} from "./pinMeta";

interface Props {
  sessionId: string;
  component: Component;
}

/**
 * Inline pin selector rendered in a hardware card's header. When the session
 * is connected, shows a select of board-valid pins (excluding pins already
 * claimed by other components) plus a Set button. Otherwise, renders a
 * read-only "Pin {n}" badge — same style as the legacy static badge.
 */
export function PinField({ sessionId, component }: Props) {
  const session = useSessionStore((s) => s.sessions.get(sessionId));
  const setPinOverrides = useSessionStore((s) => s.setPinOverrides);

  const stored = (session?.pinOverrides as Record<string, number> | undefined) ?? {};
  const currentPin = stored[component] ?? DEFAULT_PIN[component];

  const [draft, setDraft] = useState<number>(currentPin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep draft in sync with the store when the saved value changes outside
  // (hydration on connect, or another component overwriting it).
  useEffect(() => {
    setDraft(currentPin);
  }, [currentPin]);

  const isConnected = session?.state === "connected";

  // Pins claimed by *other* components in the saved store — used to exclude
  // them from this component's dropdown. Cross-component collisions can't be
  // committed because the pin won't appear as a valid option.
  const claimedByOther = useMemo(() => {
    const out = new Set<number>();
    for (const k of COMPONENT_KEYS) {
      if (k === component) continue;
      const p = stored[k] ?? DEFAULT_PIN[k];
      out.add(p);
    }
    return out;
  }, [stored, component]);

  if (!session) return null;

  if (!isConnected) {
    return (
      <span className="ml-2 text-xs font-mono text-theme-text/40" title="Connect a device to reassign this pin">
        Pin {currentPin}
      </span>
    );
  }

  const options = validPinsFor(component, session.board, claimedByOther);
  // Always include the currently-saved pin even if it would otherwise be
  // filtered (so the dropdown can render its current value).
  if (!options.includes(currentPin)) options.unshift(currentPin);
  // Include the draft too, for the same reason while editing.
  if (!options.includes(draft)) options.unshift(draft);

  const dirty = draft !== currentPin;

  const handleSet = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await getClientForSession(sessionId)?.setPins(sessionId, { [component]: draft });
      if (!result) {
        setError("Backend client unavailable.");
        return;
      }
      setPinOverrides(sessionId, result.applied);
      const compErr = result.errors?.find((e) => e.component === component);
      if (compErr) setError(compErr.error);
    } catch (err) {
      const e = err as { status?: number; body?: unknown; message?: string };
      const detail = (e?.body as { detail?: unknown })?.detail;
      if (typeof detail === "string") setError(detail);
      else if (detail && typeof detail === "object") setError(JSON.stringify(detail));
      else setError(e?.message ?? "Failed to set pin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle">
      <span className="text-xs font-mono text-theme-text/60">Pin</span>
      <select
        value={draft}
        onChange={(e) => { setDraft(Number(e.target.value)); setError(null); }}
        disabled={saving}
        className="input-base h-6 w-16 px-1 py-0 text-xs font-mono"
      >
        {options.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSet}
        disabled={!dirty || saving}
        title={
          !dirty
            ? "No change"
            : COMPONENT_REQUIRES_PWM[component]
              ? "Set pin (PWM-capable required)"
              : "Set pin"
        }
        className="btn-sm h-6 bg-accent text-accent-contrast px-2 py-0 text-xs disabled:opacity-40"
      >
        {saving ? "…" : "Set"}
      </button>
      {error && <span className="ml-1 text-xs text-red-500 font-mono">{error}</span>}
    </span>
  );
}
