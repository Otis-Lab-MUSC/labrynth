import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { getLocalClient } from "../api/client";

const SUSPEND_MS = 300_000;    // 5 minutes → show suspended overlay
const SHUTDOWN_MS = 3_600_000; // 60 minutes → change overlay to "closing" + fire shutdown

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "scroll",
  "pointerdown",
  "visibilitychange",
] as const;

/**
 * Dual idle timer driving the ServerSuspendedOverlay.
 *
 * SUSPEND_MS of no activity  → setServerSuspended(true)
 * SHUTDOWN_MS of no activity → setAppClosing(true) + POST /api/lifecycle/shutdown
 *                              (skipped when hasActiveSession is true)
 *
 * Any user activity resets both timers. On visibilitychange, only resets
 * when the tab becomes visible (not when it is hidden).
 */
export function useIdleTimer(hasActiveSession: boolean) {
  // Keep hasActiveSession current inside the stable event handler without
  // re-registering all listeners on every session state change.
  const hasActiveSessionRef = useRef(hasActiveSession);
  useEffect(() => {
    hasActiveSessionRef.current = hasActiveSession;
  }, [hasActiveSession]);

  useEffect(() => {
    const suspendTimer: { id: ReturnType<typeof setTimeout> | null } = { id: null };
    const shutdownTimer: { id: ReturnType<typeof setTimeout> | null } = { id: null };

    function clearTimers() {
      if (suspendTimer.id !== null) clearTimeout(suspendTimer.id);
      if (shutdownTimer.id !== null) clearTimeout(shutdownTimer.id);
    }

    function scheduleTimers() {
      clearTimers();

      suspendTimer.id = setTimeout(() => {
        useAppStore.getState().setServerSuspended(true);
      }, SUSPEND_MS);

      shutdownTimer.id = setTimeout(() => {
        if (hasActiveSessionRef.current) return;
        // Ensure the overlay is visible even if the 5-min suspend was dismissed
        useAppStore.getState().setServerSuspended(true);
        useAppStore.getState().setAppClosing(true);
        getLocalClient().shutdown().catch(() => {});
      }, SHUTDOWN_MS);
    }

    function onActivity(e: Event) {
      // visibilitychange fires on both hide and show; only reset on show
      if (e.type === "visibilitychange" && document.visibilityState !== "visible") {
        return;
      }
      // If the overlay is showing, user interaction dismisses it and restarts timers
      if (useAppStore.getState().serverSuspended) {
        useAppStore.getState().setServerSuspended(false);
      }
      scheduleTimers();
    }

    scheduleTimers();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
    // Empty deps: the effect runs once. hasActiveSession is tracked via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
