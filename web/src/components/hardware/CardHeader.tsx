import type { ReactNode } from "react";
import { describeUnsent, isUnsent, type UploadField } from "../../lib/cardSet";
import { baselineKey, uploadKey, useCardSyncStore } from "../../store/useCardSyncStore";
import type { Component } from "./pinMeta";
import { PinField } from "./PinField";
import { usePinDraft } from "./usePinDraft";

interface CardHeaderProps {
  sessionId: string;
  /** Unique per card within a session, e.g. "laser", "cue1". Keys the fields' remembered uploads. */
  cardId: string;
  /** Card title text. */
  title: ReactNode;
  /** The card's remappable pin, if it has one. It has its own upload button beside it. */
  pinComponent?: Component;
  /** Extra inline badges after the pin (e.g. "Active"). */
  badges?: ReactNode;
  /** The card's upload fields, checked for the "Unsent changes" line. */
  uploads?: UploadField[];
  armed?: boolean;
}

/**
 * Card title row (title, the pin with its own upload button, badges), then an amber line naming
 * every setting whose new value is not on the board yet, the pin included.
 */
export function CardHeader({
  sessionId, cardId, title, pinComponent, badges, uploads = [], armed = false,
}: CardHeaderProps) {
  const pin = usePinDraft(sessionId, pinComponent);
  const sigs = useCardSyncStore((s) => s.sigs);
  const unsent = uploads
    .filter((f) => {
      const key = uploadKey(sessionId, f.scope ?? cardId, f.id);
      return isUnsent(f, sigs[key] ?? null, armed, sigs[baselineKey(key)] ?? null);
    })
    .map((f) => f.label);
  if (pin?.isDirty) unsent.push("Pin");
  const note = describeUnsent(unsent);
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap" data-card-set={cardId}>
        <h3 className="font-medium text-theme-text">{title}</h3>
        {pin && <PinField sessionId={sessionId} pin={pin} />}
        {badges}
      </div>
      {note && (
        <p className="text-xs font-semibold text-amber-500" data-unsent={unsent.join("|")} aria-live="polite">
          {note}
        </p>
      )}
    </>
  );
}
