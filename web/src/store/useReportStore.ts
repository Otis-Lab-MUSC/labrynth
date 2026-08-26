import { create } from "zustand";

interface ReportStore {
  open: boolean;
  prefill: string;
  openReport: (prefill?: string) => void;
  closeReport: () => void;
}

export const useReportStore = create<ReportStore>((set) => ({
  open: false,
  prefill: "",
  openReport: (prefill = "") => set({ open: true, prefill }),
  closeReport: () => set({ open: false }),
}));
