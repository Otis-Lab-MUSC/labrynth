import { create } from "zustand";
import type { DiscoveredDevice, Machine } from "../types";
import { MachineApiClient } from "../api/client";
import { DemoMachineApiClient } from "../api/demoClient";
import {
  LOCAL_PLACEHOLDER_ID,
  createProxyClient,
  deleteCachedClient,
  ensureClient,
  getCachedClient,
  getLocalClient,
  setCachedClient,
  setLocalClient,
} from "../lib/machineClients";
import {
  loadPersistedMachines,
  persistRemoteMachines,
  toPairedMachine,
  toPersistedRemoteMachine,
  type PairResult,
} from "../lib/machineStorage";
import { migrateLegacyKeys, pollDiscovery, seedPersistedClients } from "./machineDiscovery";

export { LOCAL_PLACEHOLDER_ID };

const HEALTH_POLL_INTERVAL_MS = 30_000;
const DISCOVERY_POLL_INTERVAL_MS = 10_000;
const REACHER_SERVICE_NAME = "reacher";

interface MachineStore {
  machines: Machine[];
  /** Devices discovered via mDNS but not yet paired */
  discoveredDevices: DiscoveredDevice[];
  /** deviceId of the currently selected machine for new session creation */
  activeMachineId: string | null;
  /** True once initLocalMachine() has resolved — gates session recovery */
  ready: boolean;

  initLocalMachine: () => Promise<void>;
  addMachine: (url: string, apiKey: string, name?: string) => Promise<Machine>;
  pairMachine: (deviceId: string, code: string, name?: string) => Promise<Machine>;
  pairByCode: (code: string, name?: string) => Promise<Machine>;
  pairMachineByUrl: (url: string, code: string, name?: string) => Promise<Machine>;
  removeMachine: (deviceId: string) => Promise<void>;
  renameMachine: (deviceId: string, name: string) => void;
  setMachineOnline: (deviceId: string, online: boolean) => void;
  setActiveMachine: (deviceId: string) => void;
  getClient: (deviceId: string) => MachineApiClient | null;
  startPolling: () => void;
  stopPolling: () => void;
  startDiscoveryPolling: () => void;
  stopDiscoveryPolling: () => void;
  /** Trigger an immediate discovery poll and return a promise that resolves when done. */
  refreshDiscovery: () => Promise<void>;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;
let discoveryInterval: ReturnType<typeof setInterval> | null = null;

function buildLocalMachine(overrides: Partial<Machine>): Machine {
  return {
    deviceId: LOCAL_PLACEHOLDER_ID,
    name: "Local",
    hostname: "localhost",
    url: "",
    isLocal: true,
    paired: true,
    online: false,
    lastSeen: null,
    ...overrides,
  };
}

async function probeLocalMachine(client: MachineApiClient): Promise<Machine> {
  const health = await client.probeHealth();
  if (!health || health.service !== REACHER_SERVICE_NAME) return buildLocalMachine({});
  return buildLocalMachine({
    deviceId: health.device_id,
    name: health.hostname,
    hostname: health.hostname,
    online: true,
    lastSeen: new Date().toISOString(),
  });
}

function trimmedName(name?: string): string | undefined {
  return name?.trim() || undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

async function postPairing(path: string, body: Record<string, unknown>): Promise<PairResult> {
  return getLocalClient().request<PairResult>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const useMachineStore = create<MachineStore>((set, get) => {
  const persisted = loadPersistedMachines();
  seedPersistedClients(persisted);

  function registerPaired(result: PairResult, options: { rejectDuplicate: boolean }): Machine {
    if (options.rejectDuplicate && get().machines.some((m) => m.deviceId === result.device_id)) {
      throw new Error("This machine is already connected");
    }
    const machine = toPairedMachine(result);
    setCachedClient(machine.deviceId, createProxyClient(machine.deviceId));
    set((s) => {
      const next = [...s.machines, machine];
      persistRemoteMachines(next);
      return {
        machines: next,
        discoveredDevices: s.discoveredDevices.filter((d) => d.deviceId !== machine.deviceId),
      };
    });
    return machine;
  }

  return {
    machines: persisted.map(toPersistedRemoteMachine),
    discoveredDevices: [],
    activeMachineId: null,
    ready: false,

    initLocalMachine: async () => {
      // The demo site has no backend, so it gets an online local placeholder.
      if (import.meta.env.VITE_DEMO_SITE === "true") {
        const placeholder = buildLocalMachine({ online: true });
        setCachedClient(LOCAL_PLACEHOLDER_ID, new DemoMachineApiClient());
        set((s) => ({
          machines: [placeholder, ...s.machines.filter((m) => !m.isLocal)],
          activeMachineId: LOCAL_PLACEHOLDER_ID,
          ready: true,
        }));
        return;
      }

      const client = new MachineApiClient("");
      const local = await probeLocalMachine(client);
      setLocalClient(client);
      setCachedClient(local.deviceId, client);
      set((s) => ({
        machines: [local, ...s.machines.filter((m) => !m.isLocal)],
        activeMachineId: local.deviceId,
        ready: true,
      }));
      void migrateLegacyKeys(persisted, () => get().machines);
    },

    addMachine: async (url, apiKey, name) => {
      const result = await postPairing("/discovery/manual", {
        url: stripTrailingSlash(url),
        api_key: apiKey,
        name: trimmedName(name),
      });
      return registerPaired(result, { rejectDuplicate: true });
    },

    pairMachine: async (deviceId, code, name) => {
      const result = await postPairing(`/discovery/${deviceId}/pair`, { code, name: trimmedName(name) });
      return registerPaired(result, { rejectDuplicate: false });
    },

    pairByCode: async (code, name) => {
      const result = await postPairing("/discovery/pair-by-code", { code, name: trimmedName(name) });
      return registerPaired(result, { rejectDuplicate: false });
    },

    pairMachineByUrl: async (url, code, name) => {
      const result = await postPairing("/discovery/pair-by-url", {
        url: stripTrailingSlash(url),
        code,
        name: trimmedName(name),
      });
      return registerPaired(result, { rejectDuplicate: true });
    },

    removeMachine: async (deviceId) => {
      try {
        await getLocalClient().request(`/discovery/${deviceId}`, { method: "DELETE" });
      } catch {
        // The machine may already be removed server-side or offline; local cleanup still proceeds.
      }
      deleteCachedClient(deviceId);
      set((s) => {
        const next = s.machines.filter((m) => m.deviceId !== deviceId);
        persistRemoteMachines(next);
        return {
          machines: next,
          activeMachineId: s.activeMachineId === deviceId ? (next[0]?.deviceId ?? null) : s.activeMachineId,
        };
      });
    },

    renameMachine: (deviceId, name) => {
      set((s) => {
        const next = s.machines.map((m) => (m.deviceId === deviceId ? { ...m, name } : m));
        persistRemoteMachines(next);
        return { machines: next };
      });
    },

    setMachineOnline: (deviceId, online) => {
      set((s) => ({
        machines: s.machines.map((m) =>
          m.deviceId === deviceId
            ? { ...m, online, lastSeen: online ? new Date().toISOString() : m.lastSeen }
            : m,
        ),
      }));
    },

    setActiveMachine: (deviceId) => {
      set({ activeMachineId: deviceId });
    },

    getClient: (deviceId) => {
      const cached = getCachedClient(deviceId);
      if (cached) return cached;
      const machine = get().machines.find((m) => m.deviceId === deviceId);
      return machine ? ensureClient(machine) : null;
    },

    startPolling: () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        const { machines, setMachineOnline, getClient } = get();
        for (const machine of machines) {
          const client = getClient(machine.deviceId);
          if (!client) continue;
          const health = await client.probeHealth();
          setMachineOnline(machine.deviceId, health?.service === REACHER_SERVICE_NAME);
        }
      }, HEALTH_POLL_INTERVAL_MS);
    },

    stopPolling: () => {
      if (!pollInterval) return;
      clearInterval(pollInterval);
      pollInterval = null;
    },

    startDiscoveryPolling: () => {
      if (discoveryInterval) return;
      void pollDiscovery(set, get);
      discoveryInterval = setInterval(() => void pollDiscovery(set, get), DISCOVERY_POLL_INTERVAL_MS);
    },

    stopDiscoveryPolling: () => {
      if (!discoveryInterval) return;
      clearInterval(discoveryInterval);
      discoveryInterval = null;
    },

    refreshDiscovery: () => pollDiscovery(set, get),
  };
});
