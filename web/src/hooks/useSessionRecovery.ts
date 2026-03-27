import { useEffect, useRef } from "react";
import { useSessionStore } from "../store/useSessionStore";
import { useMachineStore, LOCAL_PLACEHOLDER_ID } from "../store/useMachineStore";
import type { SessionState } from "../types";

const STORAGE_KEY = "reacher-sessions";

interface StoredSession {
  sessionId: string;
  port: string;
  paradigm: string | null;
  /** deviceId of the owning Machine. Absent in legacy entries — defaults to local. */
  machineId?: string;
}

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
                rhLeverCounts: { active: 0, timeout: 0, inactive: 0 },
                lhLeverCounts: { active: 0, timeout: 0, inactive: 0 },
                hardwareUi: {
                  rhLever: { armed: false, timeout: 20000, ratio: 1 },
                  lhLever: { armed: false, timeout: 20000, ratio: 1 },
                  primaryCue: { armed: false, frequency: 2900, duration: 1000 },
                  secondaryCue: { armed: false, frequency: 2900, duration: 1000 },
                  primaryPump: { armed: false, duration: 3000 },
                  secondaryPump: { armed: false, duration: 3000 },
                  laser: { armed: false, frequency: 20, duration: 10000, mode: "contingent" },
                  lickCircuit: { armed: false },
                  microscope: { armed: false, frameRate: null, frameAveraging: null },
                  testMode: false,
                },
                fileConfig: { filename: "", destination: "" },
                exportState: { exporting: false, result: null, error: null },
              });
              return {
                sessions: next,
                sessionOrder: [...s.sessionOrder, entry.sessionId],
                activeSessionId: s.activeSessionId ?? entry.sessionId,
              };
            });
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
      for (const [id, sess] of state.sessions) {
        if (!sess.draft) {
          entries.push({ sessionId: id, port: sess.port, paradigm: sess.paradigm, machineId: sess.machineId });
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
  for (const [id, sess] of sessions) {
    if (!sess.draft) {
      entries.push({ sessionId: id, port: sess.port, paradigm: sess.paradigm, machineId: sess.machineId });
    }
  }
  if (entries.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
