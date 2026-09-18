import { useEffect } from "react";
import { getLocalClient, getToken } from "../api/client";

export function useBeforeUnload(blocked = false) {
  useEffect(() => {
    if (blocked) return;

    // Prewarm the token cache so getCachedToken() below isn't reached cold
    // on a fast open-then-close.
    void getToken();

    let shutdownSent = false;

    const sendShutdown = () => {
      if (shutdownSent) return;
      shutdownSent = true;
      // /lifecycle/shutdown requires auth; sendBeacon cannot set an
      // Authorization header, so this mirrors logging/transport.ts's
      // fetch(keepalive) fix for the same constraint. No body is sent, so
      // the ~64 KB keepalive budget is a non-issue. If no token is cached
      // yet, send nothing rather than falling back to an unauthenticated
      // beacon — that would reopen the hole this closes. The websocket
      // watchdog reclaims an unreached backend regardless (soft-suspend at
      // 300s idle, hard kill 3300s later), so a dropped beacon is a delayed
      // exit, never a stranded backend or lost data.
      const token = getLocalClient().getCachedToken();
      if (!token) return;
      fetch("/api/lifecycle/shutdown", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {});
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      sendShutdown();
    };

    const onUnload = () => sendShutdown();

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("unload", onUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("unload", onUnload);
    };
  }, [blocked]);
}
