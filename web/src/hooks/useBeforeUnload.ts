import { useEffect } from "react";

export function useBeforeUnload(blocked = false) {
  useEffect(() => {
    if (blocked) return;

    let shutdownSent = false;

    const sendShutdown = () => {
      if (!shutdownSent) {
        shutdownSent = true;
        navigator.sendBeacon("/api/lifecycle/shutdown");
      }
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
