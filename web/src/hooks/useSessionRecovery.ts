import { useEffect, useRef } from "react";
import { useSessionStore, defaultHardwareUiState } from "../store/useSessionStore";
import { useMachineStore, LOCAL_PLACEHOLDER_ID } from "../store/useMachineStore";
import type { BehaviorEvent, SessionState } from "../types";
import { restoredFields, toStoredSession, type StoredSession } from "../lib/sessionRecovery";

const STORAGE_KEY = "reacher-sessions";

/** Persist live session IDs to localStorage and recover on reload. */
export function useSessionRecovery() {
  const didRecover = useRef(false);

  // On mount: check for orphaned backend sessions and restore them
  useEffect(() => {
    if (didRecover.current) return;
    didRecover.current = true;

    // Demo site has no backend — skip recovery entirely
    if (import.meta.env.VITE_DEMO_SITE === "true") return;

    // Wait for machine store to be ready before attempting recovery
    const attemptRecovery = async () => {
      const machineStore = useMachineStore.getState();
      if (!machineStore.ready) {
        // Poll until ready (initLocalMachine is called in App.tsx)
        await new Promise<void>((resolve) => {
          const unsub = useMachineStore.subscribe((s) => {
            if (s.ready) { unsub(); resolve(); }
          });
        });
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      let stored: StoredSession[];
      try {
        stored = JSON.parse(raw);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      const { sessions } = useSessionStore.getState();

      for (const entry of stored) {
        if (sessions.has(entry.sessionId)) continue;

        // Resolve which machine owns this session.
        // Legacy entries (no machineId) fall back to the local machine.
        const machineStoreState = useMachineStore.getState();
        const machineId = entry.machineId
          ?? (machineStoreState.machines.find((m) => m.isLocal)?.deviceId ?? LOCAL_PLACEHOLDER_ID);

        const machine = machineStoreState.machines.find((m) => m.deviceId === machineId);
        if (!machine || !machine.online) continue;

        const client = machineStoreState.getClient(machineId);
        if (!client) continue;

        try {
          const info = await client.getSession(entry.sessionId);
          if (info && (info as Record<string, unknown>).state !== "destroying") {
            const infusionCountFromServer = (info as Record<string, unknown>).infusion_count;
            const infusionsByPumpFromServer = (info as Record<string, unknown>).infusions_by_pump as Record<string, number> | undefined;
            useSessionStore.setState((s) => {
              const next = new Map(s.sessions);
              if (next.has(entry.sessionId)) return s;
              next.set(entry.sessionId, {
                id: entry.sessionId,
                draft: false,
                machineId,
                port: entry.port,
                paradigm: entry.paradigm,
                board: null,
                state: (((info as Record<string, unknown>).state as string) || "idle") as SessionState,
                ...restoredFields(entry),
                firmwareInfo: null,
                hardwareSettings: [],
                behaviorData: [],
                frameData: [],
                slmData: [],
                infusionCount: 0,
                serverInfusionCount: typeof infusionCountFromServer === "number" ? infusionCountFromServer : null,
                infusionsByPump: infusionsByPumpFromServer ?? null,
                pressCount: 0,
                programStartTime: null,
                programEndTime: null,
                pausedTime: 0,
                pauseStartTime: null,
                pavlovianParams: null,
                trialCount: 0,
                csPlusCount: 0,
                csMinusCount: 0,
                rhLeverCounts: { active: 0, timeout: 0, inactive: 0 },
                lhLeverCounts: { active: 0, timeout: 0, inactive: 0 },
                hardwareUi: defaultHardwareUiState(),
                pinOverrides: {},
                fileConfig: { filename: "", destination: "" },
                exportState: { exporting: false, result: null, error: null },
                segmentNumber: 0,
                cumulativeInfusionCount: 0,
                cumulativePressCount: 0,
                cumulativeTrialCount: 0,
                cumulativeCsPlusCount: 0,
                cumulativeCsMinusCount: 0,
                cumulativeShockCount: 0,
                cumulativeRhLeverCounts: { active: 0, timeout: 0, inactive: 0 },
                cumulativeLhLeverCounts: { active: 0, timeout: 0, inactive: 0 },
                cumulativeElapsedTime: 0,
              });
              return {
                sessions: next,
                sessionOrder: [...s.sessionOrder, entry.sessionId],
                activeSessionId: s.activeSessionId ?? entry.sessionId,
              };
            });
            await rehydrateData(client, entry.sessionId);
          }
        } catch {
          // Session no longer exists on backend — skip
        }
      }

      syncToStorage();
    };

    attemptRecovery();
  }, []);

  // Whenever sessions change, sync to localStorage
  useEffect(() => {
    return useSessionStore.subscribe((state) => {
      const entries: StoredSession[] = [];
      for (const sess of state.sessions.values()) {
        if (!sess.draft) {
          entries.push(toStoredSession(sess));
        }
      }
      if (entries.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }, []);
}

function syncToStorage() {
  const { sessions } = useSessionStore.getState();
  const entries: StoredSession[] = [];
  for (const sess of sessions.values()) {
    if (!sess.draft) {
      entries.push(toStoredSession(sess));
    }
  }
  if (entries.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Pull the recorded data back from the backend, which keeps it for the session's whole
 *  life (running or stopped). Without this a reload leaves a stopped session looking empty. */
async function rehydrateData(client: NonNullable<ReturnType<ReturnType<typeof useMachineStore.getState>["getClient"]>>, sessionId: string) {
  const [behavior, frames, slm] = await Promise.allSettled([
    client.getBehavior(sessionId),
    client.getFrames(sessionId),
    client.getSlmEvents(sessionId),
  ]);
  const cur = useSessionStore.getState().sessions.get(sessionId);
  if (!cur) return;
  // A live event that landed while we were fetching means the buffer is already newer.
  if (behavior.status === "fulfilled" && behavior.value.data.length >= cur.behaviorData.length) {
    useSessionStore.getState().replaceEvents(sessionId, behavior.value.data as unknown as BehaviorEvent[]);
  }
  useSessionStore.setState((s) => {
    const sess = s.sessions.get(sessionId);
    if (!sess) return s;
    const next = new Map(s.sessions);
    next.set(sessionId, {
      ...sess,
      frameData: frames.status === "fulfilled" && frames.value.frames.length >= sess.frameData.length
        ? (frames.value.frames as number[]) : sess.frameData,
      slmData: slm.status === "fulfilled" && slm.value.slm.length >= sess.slmData.length
        ? slm.value.slm : sess.slmData,
    });
    return { sessions: next };
  });
}
