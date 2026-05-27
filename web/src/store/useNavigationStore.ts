import { create } from "zustand";

export type Panel = "session" | "configuration" | "monitor";

interface NavigationStore {
  activePanel: Panel;
  setActivePanel: (panel: Panel) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activePanel: "session",
  setActivePanel: (panel) => set({ activePanel: panel }),
}));
