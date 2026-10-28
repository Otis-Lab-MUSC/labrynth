import { useEffect, useState } from "react";
import {
  buildCardCommands, sendAll, uploadSignature, uploadState, isUploadPending,
  type CardSend, type UploadField,
} from "../../lib/cardSet";
import { baselineKey, uploadKey, useCardSyncStore } from "../../store/useCardSyncStore";
import { UploadIconButton, type UploadButtonTone } from "./UploadIconButton";

interface FieldUploadProps {
  sessionId: string;
  cardId: string;
  field: UploadField;
  send: CardSend;
  /** An armed device with a value never uploaded is flagged amber. */
  armed?: boolean;
  onSent?: () => void;
}

function getTooltip(label: string, isValid: boolean, isPending: boolean, isSent: boolean): string {
  if (!isValid) return `Fill in ${label} first`;
  if (isPending) return `Upload ${label} to the board (changed since the last upload)`;
  if (isSent) return `${label} is on the board`;
  return `Upload ${label} to the board`;
}

/** The upload button beside one field. Sends that field's command(s) and remembers what was sent. */
export function FieldUpload({ sessionId, cardId, field, send, armed = false, onSent }: FieldUploadProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = uploadKey(sessionId, field.scope ?? cardId, field.id);
  const lastSig = useCardSyncStore((s) => s.sigs[key] ?? null);
  const baseSig = useCardSyncStore((s) => s.sigs[baselineKey(key)] ?? null);
  const record = useCardSyncStore((s) => s.record);
  const baseline = useCardSyncStore((s) => s.baseline);
  const sig = uploadSignature(field);

  // The value first shown is the baseline: moving off it marks the field as changed.
  useEffect(() => {
    baseline(key, sig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, baseline]);

  const cmds = buildCardCommands(field.fields);
  const isPending = isUploadPending(field, lastSig, armed, baseSig);
  const isSent = uploadState(field, lastSig, baseSig) === "synced";
  let tone: UploadButtonTone = "default";
  if (isPending) tone = "pending";
  else if (isSent) tone = "sent";

  const handleClick = async () => {
    if (!cmds || sending) return;
    setSending(true);
    const result = await sendAll(send, cmds);
    setSending(false);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    setError(null);
    record(key, uploadSignature(field));
    onSent?.();
  };

  return (
    <>
      <UploadIconButton
        onClick={handleClick}
        disabled={cmds === null || sending}
        title={getTooltip(field.label, cmds !== null, isPending, isSent)}
        tone={tone}
        sending={sending}
      />
      {error && <span className="text-xs text-red-500" role="alert">Upload failed: {error}</span>}
    </>
  );
}
