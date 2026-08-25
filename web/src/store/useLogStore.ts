import { create } from "zustand";
import { log as diagLog } from "../logging";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  message: string;
  sessionId?: string;
}

const MAX_ENTRIES = 500;

interface LogStore {
  entries: LogEntry[];
  isOpen: boolean;
  nextId: number;
  pushLog: (level: LogLevel, message: string, sessionId?: string) => void;
  clearLogs: () => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  isOpen: false,
  nextId: 1,
  pushLog: (level, message, sessionId) => {
    // Tee to the durable log so the existing in-app terminal keeps working
    // while its contents also survive a reload or crash.
    diagLog("ui.log", { message }, level === "warn" ? "warn" : level === "error" ? "error" : "info", {
      msg: message,
      src: "useLogStore",
      sessionId,
    });
    return set((s) => ({
      nextId: s.nextId + 1,
      entries: [
        { id: s.nextId, timestamp: Date.now(), level, message, sessionId },
        ...s.entries,
      ].slice(0, MAX_ENTRIES),
    }));
  },
  clearLogs: () => set({ entries: [] }),
  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
}));
