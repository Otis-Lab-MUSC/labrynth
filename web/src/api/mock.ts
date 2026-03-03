import type { BoardInfo } from "../types";
import { useSessionStore } from "../store/useSessionStore";

let simulatorTimer: ReturnType<typeof setTimeout> | null = null;
let frameInterval: ReturnType<typeof setInterval> | null = null;
let simulatedSessionId: string | null = null;
let eventTimestamp = 0;

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pushSimulatedEvent() {
  if (!simulatedSessionId) return;
  const store = useSessionStore.getState();
  const session = store.sessions.get(simulatedSessionId);
  if (!session || session.state !== "running") return;

  eventTimestamp += randomBetween(100, 500);

  const roll = Math.random();
  if (roll < 0.5) {
    // Lever press
    const lever = Math.random() < 0.7 ? "RH_LEVER" : "LH_LEVER";
    const events = ["ACTIVE_PRESS", "TIMEOUT_PRESS", "INACTIVE_PRESS"];
    const weights = [0.6, 0.25, 0.15];
    let r = Math.random();
    let eventType = events[0];
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { eventType = events[i]; break; }
    }
    store.pushEvent(simulatedSessionId, {
      device: lever,
      event: eventType,
      start_timestamp: eventTimestamp,
      end_timestamp: eventTimestamp + randomBetween(50, 200),
    });
  } else if (roll < 0.7) {
    // Infusion
    store.pushEvent(simulatedSessionId, {
      device: "PUMP",
      event: "INFUSION",
      start_timestamp: eventTimestamp,
      end_timestamp: eventTimestamp + 3000,
    });
  } else if (roll < 0.85) {
    // Cue
    store.pushEvent(simulatedSessionId, {
      device: "CUE",
      event: "TONE_ON",
      start_timestamp: eventTimestamp,
      end_timestamp: eventTimestamp + 1000,
    });
  } else {
    // Lick
    store.pushEvent(simulatedSessionId, {
      device: "LICK",
      event: "LICK",
      start_timestamp: eventTimestamp,
      end_timestamp: eventTimestamp + 50,
    });
  }
}

function scheduleNextEvent() {
  simulatorTimer = setTimeout(() => {
    pushSimulatedEvent();
    if (simulatedSessionId) scheduleNextEvent();
  }, randomBetween(3000, 8000));
}

function startSimulator(sessionId: string) {
  stopSimulator();
  simulatedSessionId = sessionId;
  eventTimestamp = 0;
  scheduleNextEvent();
  frameInterval = setInterval(() => {
    if (simulatedSessionId) {
      useSessionStore.getState().pushFrame(simulatedSessionId, Date.now());
    }
  }, 33); // ~30fps
}

function stopSimulator() {
  if (simulatorTimer) {
    clearTimeout(simulatorTimer);
    simulatorTimer = null;
  }
  if (frameInterval) {
    clearInterval(frameInterval);
    frameInterval = null;
  }
  simulatedSessionId = null;
}

// --- Mock API functions ---

export const listSessions = async () => ({ sessions: [] });

export const createSession = async (_port: string, _paradigm?: string) => ({
  session_id: `demo-${crypto.randomUUID().slice(0, 8)}`,
});

export const getSession = async (_id: string) => ({});

export const destroySession = async (_id: string) => {};

export const resetSession = async (_id: string) => {};

export const listPorts = async () => ({ ports: ["DEMO-PORT"] });

export const connectSerial = async (_id: string) => ({
  status: "ok",
  port: "DEMO-PORT",
  detected_paradigm: "fr",
  detected_board: "uno",
});

export const disconnectSerial = async (_id: string) => {};

export const listBoards = async () => ({
  boards: [
    { id: "uno", name: "Arduino UNO" },
    { id: "mega", name: "Arduino Mega" },
  ] as BoardInfo[],
});

export const listParadigms = async (_board?: string) => ({
  paradigms: ["fr", "pr", "vi", "omission", "pavlovian"],
});

export const uploadFirmware = async (_id: string, paradigm: string, board: string = "uno") => ({
  status: "ok",
  paradigm,
  board,
  firmware_info: {
    sketch: paradigm,
    version: "2.0.0",
    baud_rate: 115200,
    desc: `Demo ${paradigm.toUpperCase()} firmware`,
  },
});

export const sendCommand = async (_id: string, _code: number, _value?: number) => ({
  status: "ok",
});

export const getCommands = async (_id: string) => ({
  paradigm: "fr",
  commands: [],
});

export const getConfig = async (_id: string) => ({
  firmware_info: {},
  hardware_settings: [],
});

export const startProgram = async (id: string) => {
  useSessionStore.getState().updateState(id, "running");
  startSimulator(id);
  return { status: "ok" };
};

export const stopProgram = async (id: string) => {
  useSessionStore.getState().updateState(id, "stopped");
  stopSimulator();
  return { status: "ok" };
};

export const pauseProgram = async (id: string) => {
  const session = useSessionStore.getState().sessions.get(id);
  if (session?.state === "paused") {
    useSessionStore.getState().updateState(id, "running");
    startSimulator(id);
  } else {
    useSessionStore.getState().updateState(id, "paused");
    stopSimulator();
  }
  return { status: "ok" };
};

export const setLimit = async (_id: string, _body: unknown) => ({
  status: "ok",
});

export const getBehavior = async (_id: string, _since?: number) => ({
  data: [],
  total: 0,
});

export const getFrames = async (_id: string) => ({
  frames: [],
  count: 0,
});

export const exportZip = async (_id: string, _body: unknown) => ({
  file_path: "~/Demo/demo_export.zip",
  folder_path: "~/Demo",
});

export const shutdown = async () => {};

export const setFileConfig = async (_id: string, body: { filename?: string; destination?: string }) => ({
  filename: body.filename ?? "demo_session",
  destination: body.destination ?? "~/Demo",
});
