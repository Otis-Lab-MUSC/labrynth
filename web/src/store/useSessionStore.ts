import { create } from "zustand";
import type { BoardType, Session, SessionState, BehaviorEvent, FirmwareConfig, LeverCounts, HardwareUiState } from "../types";
import * as api from "../api/client";

interface SessionStore {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  sessionOrder: string[];
  uploadProgress: Map<string, { percent: number; stage: string }>;
  startModalOpen: boolean;

  setStartModalOpen: (open: boolean) => void;
  createDraft: () => string;
  createSession: (port: string, paradigm?: string) => Promise<string>;
  destroySession: (id: string) => Promise<void>;
  reorderSession: (fromId: string, toId: string) => void;
  setActive: (id: string | null) => void;
  updateState: (id: string, state: SessionState) => void;
  pushEvent: (id: string, event: BehaviorEvent) => void;
  pushFrame: (id: string, timestamp: number) => void;
  setFirmwareInfo: (id: string, info: FirmwareConfig) => void;
  setUploadProgress: (id: string, percent: number, stage: string) => void;
  setPavlovianParams: (id: string, params: Record<number, number>) => void;
  setParadigmSettings: (id: string, settings: { ratio: number; step: number; interval: number; traceInterval: number }) => void;
  setLimitSettings: (id: string, settings: { limitType: string; timeLimit: number; infusionLimit: number; delay: number }) => void;
  setParadigm: (id: string, paradigm: string) => void;
  setBoard: (id: string, board: BoardType) => void;
  resetSessionData: (id: string) => void;
  setSessionName: (id: string, name: string) => void;
  setSessionNotes: (id: string, notes: string) => void;
  pushHardwareSetting: (id: string, config: FirmwareConfig) => void;
  updateHardwareUi: (id: string, updater: (prev: HardwareUiState) => Partial<HardwareUiState>) => void;
  setFileConfig: (id: string, config: Partial<{ filename: string; destination: string }>) => void;
  setExportState: (id: string, partial: Partial<{ exporting: boolean; result: string | null; error: string | null }>) => void;
}

const ZERO_LEVER: LeverCounts = { active: 0, timeout: 0, inactive: 0 };

const defaultHardwareUiState = (): HardwareUiState => ({
  rhLever: { armed: false, timeout: 20000, ratio: 1 },
  lhLever: { armed: false, timeout: 20000, ratio: 1 },
  primaryCue: { armed: false, frequency: 2900, duration: 1000 },
  secondaryCue: { armed: false, frequency: 2900, duration: 1000 },
  primaryPump: { armed: false, duration: 3000, flowRate: null, volume: null },
  secondaryPump: { armed: false, duration: 3000, flowRate: null, volume: null },
  laser: { armed: false, frequency: 20, duration: 10000, mode: "contingent" },
  lickCircuit: { armed: false },
  microscope: { armed: false, frameRate: null, frameAveraging: null },
  testMode: false,
});

const newSession = (id: string, port: string, paradigm: string | null, draft = false): Session => ({
  id,
  draft,
  port,
  paradigm,
  board: null,
  state: "idle",
  name: "",
  notes: "",
  firmwareInfo: null,
  hardwareSettings: [],
  behaviorData: [],
  frameData: [],
  infusionCount: 0,
  pressCount: 0,
  programStartTime: null,
  programEndTime: null,
  pausedTime: 0,
  pauseStartTime: null,
  pavlovianParams: null,
  paradigmSettings: null,
  limitSettings: null,
  trialCount: 0,
  rhLeverCounts: { ...ZERO_LEVER },
  lhLeverCounts: { ...ZERO_LEVER },
  hardwareUi: defaultHardwareUiState(),
  fileConfig: { filename: "", destination: "" },
  exportState: { exporting: false, result: null, error: null },
});

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  sessionOrder: [],
  uploadProgress: new Map(),
  startModalOpen: false,

  setStartModalOpen: (open) => set({ startModalOpen: open }),

  createDraft: () => {
    const state = get();
    const existingDraft = state.sessionOrder.find((id: string) => state.sessions.get(id)?.draft);
    if (existingDraft) {
      set({ activeSessionId: existingDraft });
      return existingDraft;
    }
    const draftId = `draft-${crypto.randomUUID()}`;
    set((s) => {
      const next = new Map(s.sessions);
      next.set(draftId, newSession(draftId, "", null, true));
      return {
        sessions: next,
        activeSessionId: draftId,
        sessionOrder: [...s.sessionOrder, draftId],
      };
    });
    return draftId;
  },

  createSession: async (port, paradigm) => {
    const state = get();
    const activeDraft =
      state.activeSessionId && state.sessions.get(state.activeSessionId)?.draft
        ? state.activeSessionId
        : null;

    const { session_id } = await api.createSession(port, paradigm);
    set((s) => {
      const next = new Map(s.sessions);
      let nextOrder = [...s.sessionOrder];
      if (activeDraft) {
        next.delete(activeDraft);
        const idx = nextOrder.indexOf(activeDraft);
        if (idx !== -1) nextOrder[idx] = session_id;
        else nextOrder.push(session_id);
      } else {
        nextOrder.push(session_id);
      }
      next.set(session_id, newSession(session_id, port, paradigm ?? null));
      return { sessions: next, activeSessionId: session_id, sessionOrder: nextOrder };
    });
    return session_id;
  },

  destroySession: async (id) => {
    const session = get().sessions.get(id);
    if (session && !session.draft) {
      await api.destroySession(id);
    }
    set((s) => {
      const next = new Map(s.sessions);
      next.delete(id);
      const nextOrder = s.sessionOrder.filter((sid) => sid !== id);
      let activeSessionId = s.activeSessionId;
      if (activeSessionId === id) {
        const idx = s.sessionOrder.indexOf(id);
        activeSessionId = nextOrder[Math.min(idx, nextOrder.length - 1)] ?? null;
      }
      const nextProgress = new Map(s.uploadProgress);
      nextProgress.delete(id);
      return { sessions: next, activeSessionId, sessionOrder: nextOrder, uploadProgress: nextProgress };
    });
  },

  reorderSession: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return s;
      const order = s.sessionOrder.filter((id) => id !== fromId);
      const toIndex = order.indexOf(toId);
      if (toIndex === -1) return s;
      order.splice(toIndex, 0, fromId);
      return { sessionOrder: order };
    }),

  setActive: (id) => set({ activeSessionId: id }),

  updateState: (id, state) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      const isNewStart = state === "running" && sess.programStartTime === null;
      const now = Date.now();

      // Pause tracking
      const transitioningToPaused = state === "paused" && sess.state !== "paused";
      const resumingFromPause = sess.state === "paused" && state !== "paused";
      const pauseDelta =
        resumingFromPause && sess.pauseStartTime != null
          ? now - sess.pauseStartTime
          : 0;

      next.set(id, {
        ...sess,
        state,
        programStartTime: isNewStart ? now : sess.programStartTime,
        programEndTime: isNewStart ? null : (state === "stopped" && sess.programEndTime === null ? now : sess.programEndTime),
        pausedTime: isNewStart ? 0 : sess.pausedTime + pauseDelta,
        pauseStartTime: isNewStart
          ? null
          : transitioningToPaused
            ? now
            : resumingFromPause
              ? null
              : sess.pauseStartTime,
        ...(isNewStart && {
          behaviorData: [],
          frameData: [],
          infusionCount: 0,
          pressCount: 0,
          trialCount: 0,
          rhLeverCounts: { ...ZERO_LEVER },
          lhLeverCounts: { ...ZERO_LEVER },
        }),
      });
      return { sessions: next };
    }),

  pushEvent: (id, event) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess || sess.state !== "running") return s;
      const next = new Map(s.sessions);
      const infusionCount =
        event.device === "PUMP" && event.event === "INFUSION"
          ? sess.infusionCount + 1
          : sess.infusionCount;
      const pressCount =
        (event.device === "RH_LEVER" || event.device === "LH_LEVER") && event.event.includes("PRESS")
          ? sess.pressCount + 1
          : sess.pressCount;
      const trialCount =
        event.device === "PAVLOV" && event.event === "TRIAL_START"
          ? sess.trialCount + 1
          : sess.trialCount;
      const isRH = event.device === "RH_LEVER";
      const isLH = event.device === "LH_LEVER";
      const rhLeverCounts = isRH
        ? {
            active:   sess.rhLeverCounts.active   + (event.event === "ACTIVE_PRESS" ? 1 : 0),
            timeout:  sess.rhLeverCounts.timeout  + (event.event === "TIMEOUT_PRESS" ? 1 : 0),
            inactive: sess.rhLeverCounts.inactive + (event.event === "INACTIVE_PRESS" ? 1 : 0),
          }
        : sess.rhLeverCounts;
      const lhLeverCounts = isLH
        ? {
            active:   sess.lhLeverCounts.active   + (event.event === "ACTIVE_PRESS" ? 1 : 0),
            timeout:  sess.lhLeverCounts.timeout  + (event.event === "TIMEOUT_PRESS" ? 1 : 0),
            inactive: sess.lhLeverCounts.inactive + (event.event === "INACTIVE_PRESS" ? 1 : 0),
          }
        : sess.lhLeverCounts;
      next.set(id, {
        ...sess,
        behaviorData: [...sess.behaviorData, event],
        infusionCount,
        pressCount,
        trialCount,
        rhLeverCounts,
        lhLeverCounts,
      });
      return { sessions: next };
    }),

  pushFrame: (id, timestamp) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, frameData: [...sess.frameData, timestamp] });
      return { sessions: next };
    }),

  setFirmwareInfo: (id, info) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, firmwareInfo: info });
      return { sessions: next };
    }),

  setUploadProgress: (id, percent, stage) =>
    set((s) => {
      const next = new Map(s.uploadProgress);
      next.set(id, { percent, stage });
      return { uploadProgress: next };
    }),

  setPavlovianParams: (id, params) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, pavlovianParams: params });
      return { sessions: next };
    }),

  setParadigmSettings: (id, settings) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, paradigmSettings: settings });
      return { sessions: next };
    }),

  setLimitSettings: (id, settings) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, limitSettings: settings });
      return { sessions: next };
    }),

  setParadigm: (id, paradigm) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, paradigm });
      return { sessions: next };
    }),

  setBoard: (id, board) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, board });
      return { sessions: next };
    }),

  resetSessionData: (id) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, {
        ...sess,
        behaviorData: [],
        frameData: [],
        infusionCount: 0,
        pressCount: 0,
        programStartTime: null,
        programEndTime: null,
        pausedTime: 0,
        pauseStartTime: null,
        pavlovianParams: null,
        paradigmSettings: null,
        limitSettings: null,
        trialCount: 0,
        hardwareSettings: [],
        rhLeverCounts: { ...ZERO_LEVER },
        lhLeverCounts: { ...ZERO_LEVER },
        hardwareUi: defaultHardwareUiState(),
        exportState: { exporting: false, result: null, error: null },
      });
      return { sessions: next };
    }),

  setSessionName: (id, name) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, name });
      return { sessions: next };
    }),

  setSessionNotes: (id, notes) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, notes });
      return { sessions: next };
    }),

  pushHardwareSetting: (id, config) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, hardwareSettings: [...sess.hardwareSettings, config] });
      return { sessions: next };
    }),

  updateHardwareUi: (id, updater) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, hardwareUi: { ...sess.hardwareUi, ...updater(sess.hardwareUi) } });
      return { sessions: next };
    }),

  setFileConfig: (id, config) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, fileConfig: { ...sess.fileConfig, ...config } });
      return { sessions: next };
    }),

  setExportState: (id, partial) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess) return s;
      const next = new Map(s.sessions);
      next.set(id, { ...sess, exportState: { ...sess.exportState, ...partial } });
      return { sessions: next };
    }),
}));
