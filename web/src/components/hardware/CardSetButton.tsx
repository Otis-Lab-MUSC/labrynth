import { useState } from "react";
import {
  buildCardCommands, cardSyncState, fieldsSignature, firstInvalid, sendAll, SYNC_LABEL,
  type CardField, type CardSyncState,
} from "../../lib/cardSet";
import { cardSyncKey, useCardSyncStore } from "../../store/useCardSyncStore";

interface CardSetButtonProps {
  sessionId: string;
  /** Unique per card within a session, e.g. "laser", "cue1". Keys the remembered last-sent values. */
  cardId: string;
  fields: CardField[];
  send: (code: number, value: number) => Promise<unknown> | unknown;
  onSent?: () => void;
  label?: string;
  /** For a card that tracks its own "sent" flag (Shock Output's configSent); authoritative when given. */
  externalSent?: boolean;
}

const CHIP_CLASS: Record<CardSyncState, string> = {
  synced: "text-green-500",
  "unsent-changes": "text-amber-500 font-semibold",
  "not-sent": "text-theme-text/50",
};

/** Sync chip + SET button. The chip says whether the card's values match what was last sent. */
export function CardSetButton({ sessionId, cardId, fields, send, onSent, label = "Set", externalSent }: CardSetButtonProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = cardSyncKey(sessionId, cardId);
  const lastSig = useCardSyncStore((s) => s.sigs[key] ?? null);
  const record = useCardSyncStore((s) => s.record);

  const cmds = buildCardCommands(fields);
  const invalid = firstInvalid(fields);
  const state = cardSyncState(fields, lastSig, externalSent);

  const handleClick = async () => {
    if (!cmds) return;
    setSending(true);
    setError(null);
    const result = await sendAll(send, cmds);
    setSending(false);
    if (result.error === null) {
      record(key, fieldsSignature(fields));
      onSent?.();
    } else {
      setError(`Sent ${result.sent} of ${cmds.length}: ${result.error}`);
    }
  };

  return (
    <span className="inline-flex items-center gap-2" data-card-set={cardId}>
      {error && <span className="text-red-500 text-xs">{error}</span>}
      <span className={`text-xs ${CHIP_CLASS[state]}`} data-sync={state} aria-live="polite">
        {SYNC_LABEL[state]}
      </span>
      <button
        onClick={handleClick}
        disabled={!cmds || sending}
        title={invalid ? `Fix ${invalid} first` : undefined}
        className={`btn-sm disabled:opacity-50 ${state === "synced" ? "bg-theme-text/10 text-theme-text/70" : "bg-accent text-accent-contrast"}`}
      >
        {label}
      </button>
    </span>
  );
}
