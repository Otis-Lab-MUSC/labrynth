import { create } from "zustand";
import type { Session, FirmwareConfig } from "../types";
import type { SessionStore } from "./sessionStoreTypes";
import { useMachineStore } from "./useMachineStore";
import { countShocks } from "../lib/shockEvents";
import { randomUUID } from "../lib/uuid";
import { setActiveSession } from "../logging";
import { addEventToCounts, countEvents, foldSegmentIntoCumulative, nextPauseFields } from "../lib/sessionCounters";
import {
  LIVE_STATES, defaultHardwareUiState, emptyExportState, newSession,
  zeroCumulativeFields, zeroEventFields, zeroLiveFields, zeroTimingFields,
} from "./sessionDefaults";

export { LIVE_STATES, defaultHardwareUiState };

/** Applies `change` to one session; an unknown id leaves the store untouched. */
function updateSession(s: SessionStore, id: string, change: (sess: Session) => Partial<Session>): SessionStore | Pick<SessionStore, "sessions"> {
  const sess = s.sessions.get(id);
  if (!sess) return s;
  const next = new Map(s.sessions);
  next.set(id, { ...sess, ...change(sess) });
  return { sessions: next };
}

/** Firmware ACKs ({param, value}, no sketch) merge into the stored row; other records replace it. */
function mergeHardwareRow(existing: FirmwareConfig | undefined, config: FirmwareConfig): FirmwareConfig {
  if (!("param" in config && "value" in config && !("sketch" in config))) return config;
  const { param, value, ...rest } = config as Record<string, unknown>;
  return { ...(existing ?? {}), ...rest, [param as string]: value } as FirmwareConfig;
}

/** Swaps a draft's tab for the real session, or appends when there is no draft. */
function replaceOrAppend(order: string[], oldId: string | null, newId: string): string[] {
  const idx = oldId ? order.indexOf(oldId) : -1;
  if (idx === -1) return [...order, newId];
  const next = [...order];
  next[idx] = newId;
  return next;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  sessionOrder: [],
  uploadProgress: new Map(),
  startModalOpen: false,

  setStartModalOpen: (open) => set({ startModalOpen: open }),

  createDraft: (machineId) => {
    const state = get();
    const existingDraft = state.sessionOrder.find((id) => {
      const s = state.sessions.get(id);
      return s?.draft && s.machineId === machineId;
    });
    if (existingDraft) {
      set({ activeSessionId: existingDraft });
      return existingDraft;
    }
    const draftId = `draft-${randomUUID()}`;
    set((s) => {
      const next = new Map(s.sessions);
      next.set(draftId, newSession(draftId, "", null, machineId, true));
      return {
        sessions: next,
        activeSessionId: draftId,
        sessionOrder: [...s.sessionOrder, draftId],
      };
    });
    return draftId;
  },

  createSession: async (machineId, port, paradigm) => {
    const client = useMachineStore.getState().getClient(machineId);
    if (!client) throw new Error(`No client for machine ${machineId}`);

    const state = get();
    const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : undefined;
    const activeDraft = active?.draft && active.machineId === machineId ? active.id : null;

    // The backend binds a request for the generic SIMULATOR port to its own SIMn instance.
    const { session_id, port: boundPort } = await client.createSession(port, paradigm);
    set((s) => {
      const next = new Map(s.sessions);
      if (activeDraft) next.delete(activeDraft);
      next.set(session_id, newSession(session_id, boundPort ?? port, paradigm ?? null, machineId));
      return {
        sessions: next,
        activeSessionId: session_id,
        sessionOrder: replaceOrAppend(s.sessionOrder, activeDraft, session_id),
      };
    });
    return session_id;
  },

  destroySession: async (id) => {
    const session = get().sessions.get(id);
    if (session && !session.draft) {
      const client = useMachineStore.getState().getClient(session.machineId);
      await client?.destroySession(id);
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
    set((s) =>
      updateSession(s, id, (sess) => {
        const isNewStart = state === "running" && sess.programStartTime === null;
        return {
          state,
          // The command list describes the board on the other end of the port; once
          // that board is gone (upload, disconnect) it may come back as another sketch.
          firmwareCommands: LIVE_STATES.has(state) ? sess.firmwareCommands : null,
          ...nextPauseFields(sess, state, Date.now()),
          ...(isNewStart && { ...zeroLiveFields(), ...zeroCumulativeFields() }),
        };
      }),
    ),

  // A paused session still receives in-flight events and they count; pre-start states do not.
  pushEvent: (id, event) =>
    set((s) => {
      const sess = s.sessions.get(id);
      if (!sess || (sess.state !== "running" && sess.state !== "paused")) return s;
      return updateSession(s, id, () => ({
        behaviorData: [...sess.behaviorData, event],
        ...addEventToCounts(sess, event),
      }));
    }),

  replaceEvents: (id, events) =>
    set((s) => updateSession(s, id, () => ({ behaviorData: events, ...countEvents(events) }))),

  pushFrame: (id, timestamp) =>
    set((s) => updateSession(s, id, (sess) => ({ frameData: [...sess.frameData, timestamp] }))),

  setFirmwareInfo: (id, info) =>
    set((s) => updateSession(s, id, () => ({ firmwareInfo: info }))),

  setUploadProgress: (id, percent, stage) =>
    set((s) => {
      const next = new Map(s.uploadProgress);
      next.set(id, { percent, stage });
      return { uploadProgress: next };
    }),

  setPavlovianParams: (id, params) =>
    set((s) => updateSession(s, id, () => ({ pavlovianParams: params }))),

  setParadigmSettings: (id, settings) =>
    set((s) => updateSession(s, id, () => ({ paradigmSettings: settings }))),

  setLimitSettings: (id, settings) =>
    set((s) => updateSession(s, id, () => ({ limitSettings: settings }))),

  setServerInfusionCount: (id, counted, byPump) =>
    set((s) => updateSession(s, id, () => ({ serverInfusionCount: counted, infusionsByPump: byPump }))),

  setParadigm: (id, paradigm) =>
    set((s) => updateSession(s, id, () => ({ paradigm, firmwareCommands: null }))),

  setBoard: (id, board) =>
    set((s) => updateSession(s, id, () => ({ board }))),

  resetSessionData: (id) =>
    set((s) =>
      updateSession(s, id, () => ({
        name: "",
        ...zeroLiveFields(),
        ...zeroTimingFields(),
        pavlovianParams: null,
        paradigmSettings: null,
        limitSettings: null,
        hardwareSettings: [],
        hardwareUi: defaultHardwareUiState(),
        exportState: emptyExportState(),
      })),
    ),

  softResetSessionData: (id) =>
    set((s) =>
      updateSession(s, id, () => ({
        ...zeroLiveFields(),
        ...zeroTimingFields(),
        hardwareSettings: [],
        exportState: emptyExportState(),
      })),
    ),

  setSessionName: (id, name) =>
    set((s) => updateSession(s, id, () => ({ name }))),

  setSessionNotes: (id, notes) =>
    set((s) => updateSession(s, id, () => ({ notes }))),

  pushHardwareSetting: (id, config) =>
    set((s) =>
      updateSession(s, id, (sess) => {
        const device = (config as Record<string, unknown>).device as string | undefined;
        const idx = device
          ? sess.hardwareSettings.findIndex((h) => (h as Record<string, unknown>).device === device)
          : -1;
        const row = mergeHardwareRow(sess.hardwareSettings[idx], config);
        return {
          hardwareSettings: idx >= 0
            ? sess.hardwareSettings.map((h, i) => (i === idx ? row : h))
            : [...sess.hardwareSettings, row],
        };
      }),
    ),

  updateHardwareUi: (id, updater) =>
    set((s) => updateSession(s, id, (sess) => ({ hardwareUi: { ...sess.hardwareUi, ...updater(sess.hardwareUi) } }))),

  setPinOverrides: (id, overrides) =>
    set((s) => updateSession(s, id, (sess) => ({ pinOverrides: { ...sess.pinOverrides, ...overrides } }))),

  setFirmwareCommands: (id, commands) =>
    set((s) => updateSession(s, id, () => ({ firmwareCommands: commands }))),

  setFileConfig: (id, config) =>
    set((s) => updateSession(s, id, (sess) => ({ fileConfig: { ...sess.fileConfig, ...config } }))),

  setExportState: (id, partial) =>
    set((s) => updateSession(s, id, (sess) => ({ exportState: { ...sess.exportState, ...partial } }))),

  handleSplit: (id, segmentNumber) =>
    set((s) =>
      updateSession(s, id, (sess) => {
        const now = Date.now();
        return {
          segmentNumber,
          ...foldSegmentIntoCumulative(sess, countShocks(sess.behaviorData), now),
          exportState: emptyExportState(),
          programStartTime: now,
          programEndTime: null,
          pausedTime: 0,
          pauseStartTime: sess.state === "paused" ? now : null,
          ...zeroEventFields(),
        };
      }),
    ),

  handleRestart: (id) =>
    set((s) =>
      updateSession(s, id, () => ({
        state: "running",
        exportState: emptyExportState(),
        ...zeroLiveFields(),
        ...zeroCumulativeFields(),
        ...zeroTimingFields(),
        programStartTime: Date.now(),
      })),
    ),
}));

/** The backend session the user is looking at, or undefined for none or a draft tab. */
function loggedSessionId(s: SessionStore): string | undefined {
  const active = s.activeSessionId ? s.sessions.get(s.activeSessionId) : undefined;
  return active && !active.draft ? active.id : undefined;
}

// UI log records are stamped with this id, so a click can be joined to its session in the run log.
useSessionStore.subscribe((s) => setActiveSession(loggedSessionId(s)));
