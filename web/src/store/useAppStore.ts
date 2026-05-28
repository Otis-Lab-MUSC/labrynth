import { create } from "zustand";

interface AppStore {
  serverSuspended: boolean;
  hardKillIn: number | null;
  appClosing: boolean;
  setServerSuspended: (value: boolean, hardKillIn?: number) => void;
  setAppClosing: (value: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  serverSuspended: false,
  hardKillIn: null,
  appClosing: false,
  setServerSuspended: (value, hardKillIn) =>
    set((prev) => ({
      serverSuspended: value,
      hardKillIn: value ? (hardKillIn ?? null) : null,
      // Clear appClosing when suspension is lifted; preserve it while suspended
      appClosing: value ? prev.appClosing : false,
    })),
  setAppClosing: (value) => set({ appClosing: value }),
}));
