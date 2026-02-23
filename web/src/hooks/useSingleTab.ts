import { useEffect, useState } from "react";

const CHANNEL_NAME = "reacher-single-tab";

export function useSingleTab(): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    // Announce: "I'm here"
    channel.postMessage({ type: "ping" });

    channel.onmessage = (e) => {
      if (e.data.type === "ping") {
        // Another tab just opened — tell it we exist
        channel.postMessage({ type: "pong" });
      } else if (e.data.type === "pong") {
        // An older tab responded — we're the duplicate
        setBlocked(true);
      }
    };

    return () => channel.close();
  }, []);

  return blocked;
}
