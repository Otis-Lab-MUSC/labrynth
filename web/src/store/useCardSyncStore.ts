import { create } from "zustand";

/** What each card last sent to the firmware, as a fieldsSignature. Survives card unmounts (tab switches). */
interface CardSyncStore {
  sigs: Record<string, string>;
  record: (key: string, sig: string) => void;
  forget: (prefix: string) => void;
}

export const cardSyncKey = (sessionId: string, cardId: string) => `${sessionId}:${cardId}`;

export const useCardSyncStore = create<CardSyncStore>((set) => ({
  sigs: {},
  record: (key, sig) => set((s) => ({ sigs: { ...s.sigs, [key]: sig } })),
  forget: (prefix) =>
    set((s) => ({ sigs: Object.fromEntries(Object.entries(s.sigs).filter(([k]) => !k.startsWith(prefix))) })),
}));
