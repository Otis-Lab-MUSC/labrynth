import { useEffect, useRef } from "react";
import { useSessionStore } from "../store/useSessionStore";
import type { SessionState } from "../types";
import * as api from "../api/client";

const STORAGE_KEY = "reacher-sessions";

interface StoredSession {
  sessionId: string;
  port: string;
  paradigm: string | null;
}

/** Persist live session IDs to localStorage and recover on reload. */
export function useSessionRecovery() {
  const didRecover = useRef(false);

  // On mount: check for orphaned backend sessions and restore them
  useEffect(() => {
    if (didRecover.current) return;
    didRecover.current = true;

    (async () => {
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
        // Skip if already in the store
        if (sessions.has(entry.sessionId)) continue;

        try {
          const info = await api.getSession(entry.sessionId);
          if (info && (info as Record<string, unknown>).state !== "destroying") {
            // Restore into the Zustand store
            useSessionStore.setState((s) => {
              const next = new Map(s.sessions);
              if (next.has(entry.sessionId)) return s;
              next.set(entry.sessionId, {
                id: entry.sessionId,
                draft: false,
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
                  primaryPump: { armed: false, duration: 3000, flowRate: null, volume: null },
                  secondaryPump: { armed: false, duration: 3000, flowRate: null, volume: null },
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
          // Session no longer exists on backend — remove from storage
        }
      }

      // Clean up storage to match what actually recovered
      syncToStorage();
    })();
  }, []);

  // Whenever sessions change, sync to localStorage
  useEffect(() => {
    return useSessionStore.subscribe((state) => {
      const entries: StoredSession[] = [];
      for (const [id, sess] of state.sessions) {
        if (!sess.draft) {
          entries.push({ sessionId: id, port: sess.port, paradigm: sess.paradigm });
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
      entries.push({ sessionId: id, port: sess.port, paradigm: sess.paradigm });
    }
  }
  if (entries.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
