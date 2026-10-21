import { useState } from "react";
import { buildCardCommands, firstInvalid, sendAll, type CardField } from "../../lib/cardSet";

interface CardSetButtonProps {
  fields: CardField[];
  send: (code: number, value: number) => Promise<unknown> | unknown;
  onSent?: () => void;
  label?: string;
}

export function CardSetButton({ fields, send, onSent, label = "Set" }: CardSetButtonProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cmds = buildCardCommands(fields);
  const invalid = firstInvalid(fields);

  const handleClick = async () => {
    if (!cmds) return;
    setSending(true);
    setError(null);
    const result = await sendAll(send, cmds);
    setSending(false);
    if (result.error === null) {
      onSent?.();
    } else {
      setError(`Sent ${result.sent} of ${cmds.length}: ${result.error}`);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={!cmds || sending}
        title={invalid ? `Fix ${invalid} first` : undefined}
        className="btn-sm bg-accent text-accent-contrast disabled:opacity-50"
      >
        {label}
      </button>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </span>
  );
}
