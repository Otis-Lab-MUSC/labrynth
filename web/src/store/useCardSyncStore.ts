import { create } from "zustand";

/** What each card last sent to the firmware, as a fieldsSignature. Survives card unmounts (tab switches). */
interface CardSyncStore {
  sigs: Record<string, string>;
  record: (key: string, sig: string) => void;
  /** Remember a field's value as first shown, once, so an edit can be told apart from a default. */
  baseline: (key: string, sig: string) => void;
  forget: (prefix: string) => void;
}

export const cardSyncKey = (sessionId: string, cardId: string) => `${sessionId}:${cardId}`;

/** Key for one field's upload button. A card's fields share the cardSyncKey prefix. */
export const uploadKey = (sessionId: string, cardId: string, fieldId: string) =>
  `${cardSyncKey(sessionId, cardId)}:${fieldId}`;

/** Where a field's first-shown value is kept, beside its last upload. */
export const baselineKey = (key: string) => `${key}#base`;

export const useCardSyncStore = create<CardSyncStore>((set) => ({
  sigs: {},
  record: (key, sig) => set((s) => ({ sigs: { ...s.sigs, [key]: sig } })),
  baseline: (key, sig) => set((s) => (baselineKey(key) in s.sigs ? s : { sigs: { ...s.sigs, [baselineKey(key)]: sig } })),
  forget: (prefix) =>
    set((s) => ({ sigs: Object.fromEntries(Object.entries(s.sigs).filter(([k]) => !k.startsWith(prefix))) })),
}));
