import { create } from "zustand";

interface AppStore {
  serverSuspended: boolean;
  hardKillIn: number | null;
  setServerSuspended: (value: boolean, hardKillIn?: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  serverSuspended: false,
  hardKillIn: null,
  setServerSuspended: (value, hardKillIn) =>
    set({ serverSuspended: value, hardKillIn: value ? (hardKillIn ?? null) : null }),
}));
