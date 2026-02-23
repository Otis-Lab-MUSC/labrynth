import { create } from "zustand";
import type { Session, SessionState, BehaviorEvent, FirmwareConfig, LeverCounts } from "../types";
import * as api from "../api/client";

interface SessionStore {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  uploadProgress: Map<string, { percent: number; stage: string }>;

  createSession: (port: string, paradigm?: string) => Promise<string>;
  destroySession: (id: string) => Promise<void>;
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
  resetSessionData: (id: string) => void;
  setSessionName: (id: string, name: string) => void;
  setSessionNotes: (id: string, notes: string) => void;
  pushHardwareSetting: (id: string, config: FirmwareConfig) => void;
}

const ZERO_LEVER: LeverCounts = { active: 0, timeout: 0, inactive: 0 };

const newSession = (id: string, port: string, paradigm: string | null): Session => ({
  id,
  port,
  paradigm,
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
});

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: new Map(),
  activeSessionId: null,
  uploadProgress: new Map(),

  createSession: async (port, paradigm) => {
    const { session_id } = await api.createSession(port, paradigm);
    set((s) => {
      const next = new Map(s.sessions);
      next.set(session_id, newSession(session_id, port, paradigm ?? null));
      return { sessions: next, activeSessionId: session_id };
    });
    return session_id;
  },

  destroySession: async (id) => {
    await api.destroySession(id);
    set((s) => {
      const next = new Map(s.sessions);
      next.delete(id);
      const activeSessionId =
        s.activeSessionId === id ? (next.keys().next().value ?? null) : s.activeSessionId;
      return { sessions: next, activeSessionId };
    });
  },

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
}));
