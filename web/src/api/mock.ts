import type { BoardInfo, BoardType, Session } from "../types";
import { useSessionStore } from "../store/useSessionStore";

let simulatorTimer: ReturnType<typeof setTimeout> | null = null;
let frameInterval: ReturnType<typeof setInterval> | null = null;
let simulatedSessionId: string | null = null;
let eventTimestamp = 0;

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

type SimEvent = { device: string; event: string; duration: number };

function buildEventPool(session: Session): Array<{ weight: number; entry: SimEvent }> {
  const hw = session.hardwareUi;
  const paradigm = session.paradigm ?? "fr";
  const isPavlovianOrOmission = paradigm === "pavlovian" || paradigm === "omission";

  const leverEvents: string[] = isPavlovianOrOmission
    ? ["ACTIVE_PRESS", "INACTIVE_PRESS"]
    : ["ACTIVE_PRESS", "TIMEOUT_PRESS", "INACTIVE_PRESS"];
  const leverWeights: number[] = isPavlovianOrOmission ? [0.7, 0.3] : [0.6, 0.25, 0.15];

  const pool: Array<{ weight: number; entry: SimEvent }> = [];

  if (hw.rhLever.armed) {
    leverEvents.forEach((ev, i) => {
      pool.push({ weight: leverWeights[i] * (paradigm === "pavlovian" ? 0.3 : 0.5), entry: { device: "RH_LEVER", event: ev, duration: randomBetween(50, 200) } });
    });
  }
  if (hw.lhLever.armed) {
    leverEvents.forEach((ev, i) => {
      pool.push({ weight: leverWeights[i] * 0.2, entry: { device: "LH_LEVER", event: ev, duration: randomBetween(50, 200) } });
    });
  }
  if (hw.primaryPump.armed || hw.secondaryPump.armed) {
    const pumpDevice = hw.primaryPump.armed ? "PRIMARY_PUMP" : "SECONDARY_PUMP";
    pool.push({ weight: 0.2, entry: { device: pumpDevice, event: "INFUSION", duration: 3000 } });
  }
  if (hw.primaryCue.armed || hw.secondaryCue.armed) {
    const cueDevice = hw.primaryCue.armed ? "PRIMARY_CUE" : "SECONDARY_CUE";
    const cueWeight = paradigm === "pavlovian" ? 0.35 : 0.15;
    pool.push({ weight: cueWeight, entry: { device: cueDevice, event: "TONE_ON", duration: 1000 } });
  }
  if (hw.lickCircuit.armed) {
    pool.push({ weight: 0.1, entry: { device: "LICK", event: "LICK", duration: 50 } });
  }

  // Fallback to generic pool if nothing is armed
  if (pool.length === 0) {
    return [
      { weight: 0.35, entry: { device: "RH_LEVER", event: "ACTIVE_PRESS", duration: randomBetween(50, 200) } },
      { weight: 0.15, entry: { device: "RH_LEVER", event: "TIMEOUT_PRESS", duration: randomBetween(50, 200) } },
      { weight: 0.1, entry: { device: "LH_LEVER", event: "INACTIVE_PRESS", duration: randomBetween(50, 200) } },
      { weight: 0.2, entry: { device: "PUMP", event: "INFUSION", duration: 3000 } },
      { weight: 0.15, entry: { device: "CUE", event: "TONE_ON", duration: 1000 } },
      { weight: 0.05, entry: { device: "LICK", event: "LICK", duration: 50 } },
    ];
  }

  return pool;
}

function pushSimulatedEvent() {
  if (!simulatedSessionId) return;
  const store = useSessionStore.getState();
  const session = store.sessions.get(simulatedSessionId);
  if (!session || session.state !== "running") return;

  eventTimestamp += randomBetween(100, 500);

  const pool = buildEventPool(session);
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * totalWeight;
  let chosen = pool[0].entry;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) { chosen = p.entry; break; }
  }

  store.pushEvent(simulatedSessionId, {
    device: chosen.device,
    event: chosen.event,
    start_timestamp: eventTimestamp,
    end_timestamp: eventTimestamp + chosen.duration,
  });
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

export const connectSerial = async (id: string) => {
  const session = useSessionStore.getState().sessions.get(id);
  return {
    status: "ok",
    port: "DEMO-PORT",
    detected_paradigm: session?.paradigm ?? "fr",
    detected_board: session?.board ?? "uno",
  };
};

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

export const uploadFirmware = async (id: string, paradigm: string, board: string = "uno") => {
  useSessionStore.getState().setParadigm(id, paradigm);
  useSessionStore.getState().setBoard(id, board as BoardType);
  return {
    status: "ok",
    paradigm,
    board,
    firmware_info: {
      sketch: paradigm,
      version: "2.1.0",
      baud_rate: 115200,
      desc: `Demo ${paradigm.toUpperCase()} firmware`,
    },
  };
};

export const sendCommand = async (_id: string, _code: number, _value?: number) => ({
  status: "ok",
});

export const getCommands = async (id: string) => {
  const session = useSessionStore.getState().sessions.get(id);
  return {
    paradigm: session?.paradigm ?? "fr",
    commands: [],
  };
};

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

export const splitSegment = async (id: string) => {
  const session = useSessionStore.getState().sessions.get(id);
  if (session) {
    useSessionStore.getState().handleSplit(id, session.segmentNumber + 1);
  }
  return { status: "ok" };
};

export const restartProgram = async (id: string) => {
  stopSimulator();
  useSessionStore.getState().updateState(id, "running");
  startSimulator(id);
  return { status: "ok" };
};

function generateSampleCsv(id: string): string {
  const session = useSessionStore.getState().sessions.get(id);
  if (!session) return "device,event,start_timestamp,end_timestamp\n";
  const header = "device,event,start_timestamp,end_timestamp\n";
  const rows = session.behaviorData
    .map((e) => `${e.device},${e.event},${e.start_timestamp},${e.end_timestamp}`)
    .join("\n");
  return header + rows;
}

export const downloadExportZip = async (id: string, _filePath: string) => {
  const csv = generateSampleCsv(id);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "demo_export.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
