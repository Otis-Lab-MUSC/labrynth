import { describeMissingFields, invalidLabels, type CardField } from "../../lib/cardSet";

interface MissingSettingsNoteProps {
  armed: boolean;
  fields: CardField[];
}

/** Red line under an armed card naming the required fields it still needs. Hidden while disarmed or complete. */
export function MissingSettingsNote({ armed, fields }: MissingSettingsNoteProps) {
  const labels = invalidLabels(fields.filter((f) => f.required));
  if (!armed || labels.length === 0) return null;
  return <p className="text-xs text-red-400" role="status">{describeMissingFields(labels)}</p>;
}
