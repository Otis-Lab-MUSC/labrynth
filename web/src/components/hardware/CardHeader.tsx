import type { ReactNode } from "react";
import type { CardField } from "../../lib/cardSet";
import { CardSetButton } from "./CardSetButton";

interface CardHeaderProps {
  sessionId: string;
  cardId: string;
  /** Card title text, with the PinField child if the card has one. */
  title: ReactNode;
  /** The values SET sends. Empty = the card has nothing to send, so no chip and no button. */
  fields: CardField[];
  send: (code: number, value: number) => Promise<unknown> | unknown;
  onSent?: () => void;
  label?: string;
  externalSent?: boolean;
}

/** Card title row with the sync chip and SET button on the right, so SET is never at the bottom of a card. */
export function CardHeader({ title, fields, ...set }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-medium text-theme-text">{title}</h3>
      {fields.length > 0 && <CardSetButton fields={fields} {...set} />}
    </div>
  );
}
