import { create } from "zustand";
import type { DiscoveredDevice, Machine } from "../types";
import { MachineApiClient } from "../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "reacher-machines";

/** Sentinel used before the local machine's real device_id is known. */
export const LOCAL_PLACEHOLDER_ID = "__local__";

/**
 * Persisted shape for remote machines.
 * apiKey is kept optional for backward-compat migration of old localStorage entries.
 */
interface PersistedMachine {
  deviceId: string;
  name: string;
  url: string;
  hostname: string;
  apiKey?: string;
}

function persistRemoteMachines(machines: Machine[]) {
  const remote = machines
    .filter((m) => !m.isLocal)
    .map(({ deviceId, name, url, hostname }) => ({ deviceId, name, url, hostname }));
  if (remote.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadPersistedMachines(): PersistedMachine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Per-machine client cache — lives outside Zustand state so store updates
// don't re-create clients on every render.
const _clients = new Map<string, MachineApiClient>();

function ensureClient(machine: Machine): MachineApiClient {
  const existing = _clients.get(machine.deviceId);
  if (existing) return existing;
  // Proxy mode: route all calls through local server using deviceId
  const client = machine.isLocal
    ? new MachineApiClient("")
    : new MachineApiClient("", undefined, machine.deviceId);
  _clients.set(machine.deviceId, client);
  return client;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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

let _pollInterval: ReturnType<typeof setInterval> | null = null;
let _discoveryInterval: ReturnType<typeof setInterval> | null = null;

// Local client singleton used for discovery/pairing calls (always same-origin)
let _localClient: MachineApiClient | null = null;
function getLocalClient(): MachineApiClient {
  return (_localClient ??= new MachineApiClient(""));
}

export const useMachineStore = create<MachineStore>((set, get) => {
  // Hydrate persisted remote machines immediately (start as offline)
  const persisted = loadPersistedMachines();
  const initialMachines: Machine[] = persisted.map((m) => ({
    deviceId: m.deviceId,
    name: m.name,
    url: m.url,
    hostname: m.hostname,
    isLocal: false,
    paired: true,
    online: false,
    lastSeen: null,
  }));

  // Pre-populate client cache for persisted machines.
  // If a legacy entry has apiKey, use direct client (backward compat); otherwise proxy mode.
  for (const m of persisted) {
    if (m.apiKey) {
      // Legacy: stored key in browser — use it directly while we still have it
      _clients.set(m.deviceId, new MachineApiClient(m.url, m.apiKey));
    } else {
      _clients.set(m.deviceId, new MachineApiClient("", undefined, m.deviceId));
    }
  }

  return {
    machines: initialMachines,
    discoveredDevices: [],
    activeMachineId: null,
    ready: false,

    initLocalMachine: async () => {
      // Demo site has no backend — synthesise an offline local placeholder
      if (import.meta.env.VITE_DEMO_SITE === "true") {
        const placeholder: Machine = {
          deviceId: LOCAL_PLACEHOLDER_ID,
          name: "Local",
          hostname: "localhost",
          url: "",
          isLocal: true,
          paired: true,
          online: false,
          lastSeen: null,
        };
        _clients.set(LOCAL_PLACEHOLDER_ID, new MachineApiClient(""));
        set((s) => ({
          machines: [placeholder, ...s.machines.filter((m) => !m.isLocal)],
          activeMachineId: LOCAL_PLACEHOLDER_ID,
          ready: true,
        }));
        return;
      }

      const client = new MachineApiClient("");
      const health = await client.probeHealth();

      const local: Machine = health && health.service === "reacher"
        ? {
            deviceId: health.device_id,
            name: health.hostname,
            hostname: health.hostname,
            url: "",
            isLocal: true,
            paired: true,
            online: true,
            lastSeen: new Date().toISOString(),
          }
        : {
            deviceId: LOCAL_PLACEHOLDER_ID,
            name: "Local",
            hostname: "localhost",
            url: "",
            isLocal: true,
            paired: true,
            online: false,
            lastSeen: null,
          };

      _localClient = client;
      _clients.set(local.deviceId, client);

      set((s) => ({
        machines: [local, ...s.machines.filter((m) => !m.isLocal)],
        activeMachineId: local.deviceId,
        ready: true,
      }));

      // Migrate any legacy persisted entries that still have apiKey stored in localStorage
      _migrateLegacyKeys(persisted);
    },

    addMachine: async (url: string, apiKey: string, name?: string) => {
      // Manual fallback: store the key server-side via POST /api/discovery/manual
      const lc = getLocalClient();
      const result = await lc.request<{ device_id: string; hostname: string; url: string; name: string }>(
        "/discovery/manual",
        {
          method: "POST",
          body: JSON.stringify({ url: url.replace(/\/$/, ""), api_key: apiKey, name: name?.trim() || undefined }),
        },
      );

      const { machines } = get();
      if (machines.some((m) => m.deviceId === result.device_id)) {
        throw new Error("This machine is already connected");
      }

      const machine: Machine = {
        deviceId: result.device_id,
        name: result.name,
        hostname: result.hostname,
        url: result.url,
        isLocal: false,
        paired: true,
        online: true,
        lastSeen: new Date().toISOString(),
      };

      _clients.set(machine.deviceId, new MachineApiClient("", undefined, machine.deviceId));

      set((s) => {
        const next = [...s.machines, machine];
        persistRemoteMachines(next);
        return { machines: next };
      });

      return machine;
    },

    pairMachine: async (deviceId: string, code: string, name?: string) => {
      const lc = getLocalClient();
      const result = await lc.request<{ device_id: string; hostname: string; url: string; name: string }>(
        `/discovery/${deviceId}/pair`,
        {
          method: "POST",
          body: JSON.stringify({ code, name: name?.trim() || undefined }),
        },
      );

      const machine: Machine = {
        deviceId: result.device_id,
        name: result.name,
        hostname: result.hostname,
        url: result.url,
        isLocal: false,
        paired: true,
        online: true,
        lastSeen: new Date().toISOString(),
      };

      _clients.set(machine.deviceId, new MachineApiClient("", undefined, machine.deviceId));

      set((s) => {
        const next = [...s.machines, machine];
        persistRemoteMachines(next);
        // Remove from discovered list now that it's paired
        const nextDiscovered = s.discoveredDevices.filter((d) => d.deviceId !== deviceId);
        return { machines: next, discoveredDevices: nextDiscovered };
      });

      return machine;
    },

    pairByCode: async (code: string, name?: string) => {
      const lc = getLocalClient();
      const result = await lc.request<{ device_id: string; hostname: string; url: string; name: string }>(
        "/discovery/pair-by-code",
        {
          method: "POST",
          body: JSON.stringify({ code, name: name?.trim() || undefined }),
        },
      );

      const machine: Machine = {
        deviceId: result.device_id,
        name: result.name,
        hostname: result.hostname,
        url: result.url,
        isLocal: false,
        paired: true,
        online: true,
        lastSeen: new Date().toISOString(),
      };

      _clients.set(machine.deviceId, new MachineApiClient("", undefined, machine.deviceId));

      set((s) => {
        const next = [...s.machines, machine];
        persistRemoteMachines(next);
        const nextDiscovered = s.discoveredDevices.filter((d) => d.deviceId !== result.device_id);
        return { machines: next, discoveredDevices: nextDiscovered };
      });

      return machine;
    },

    pairMachineByUrl: async (url: string, code: string, name?: string) => {
      const lc = getLocalClient();
      const result = await lc.request<{ device_id: string; hostname: string; url: string; name: string }>(
        "/discovery/pair-by-url",
        {
          method: "POST",
          body: JSON.stringify({ url: url.replace(/\/$/, ""), code, name: name?.trim() || undefined }),
        },
      );

      const { machines } = get();
      if (machines.some((m) => m.deviceId === result.device_id)) {
        throw new Error("This machine is already connected");
      }

      const machine: Machine = {
        deviceId: result.device_id,
        name: result.name,
        hostname: result.hostname,
        url: result.url,
        isLocal: false,
        paired: true,
        online: true,
        lastSeen: new Date().toISOString(),
      };

      _clients.set(machine.deviceId, new MachineApiClient("", undefined, machine.deviceId));

      set((s) => {
        const next = [...s.machines, machine];
        persistRemoteMachines(next);
        return { machines: next };
      });

      return machine;
    },

    removeMachine: async (deviceId: string) => {
      // Notify backend to unpair the remote device (best-effort)
      try {
        const lc = getLocalClient();
        await lc.request(`/discovery/${deviceId}`, { method: "DELETE" });
      } catch {
        // Machine may already be removed server-side or offline; proceed with local cleanup
      }
      _clients.delete(deviceId);
      set((s) => {
        const next = s.machines.filter((m) => m.deviceId !== deviceId);
        persistRemoteMachines(next);
        return {
          machines: next,
          activeMachineId: s.activeMachineId === deviceId ? (next[0]?.deviceId ?? null) : s.activeMachineId,
        };
      });
    },

    renameMachine: (deviceId: string, name: string) => {
      set((s) => {
        const next = s.machines.map((m) => (m.deviceId === deviceId ? { ...m, name } : m));
        persistRemoteMachines(next);
        return { machines: next };
      });
    },

    setMachineOnline: (deviceId: string, online: boolean) => {
      set((s) => ({
        machines: s.machines.map((m) =>
          m.deviceId === deviceId
            ? { ...m, online, lastSeen: online ? new Date().toISOString() : m.lastSeen }
            : m,
        ),
      }));
    },

    setActiveMachine: (deviceId: string) => {
      set({ activeMachineId: deviceId });
    },

    getClient: (deviceId: string) => {
      if (_clients.has(deviceId)) return _clients.get(deviceId)!;
      const machine = get().machines.find((m) => m.deviceId === deviceId);
      if (!machine) return null;
      return ensureClient(machine);
    },

    startPolling: () => {
      if (_pollInterval) return;
      _pollInterval = setInterval(async () => {
        const { machines, setMachineOnline, getClient } = get();
        for (const machine of machines) {
          const client = getClient(machine.deviceId);
          if (!client) continue;
          const health = await client.probeHealth();
          setMachineOnline(machine.deviceId, health?.service === "reacher");
        }
      }, 30_000);
    },

    stopPolling: () => {
      if (_pollInterval) {
        clearInterval(_pollInterval);
        _pollInterval = null;
      }
    },

    startDiscoveryPolling: () => {
      if (_discoveryInterval) return;
      // Poll immediately then on interval
      _pollDiscovery(set, get);
      _discoveryInterval = setInterval(() => _pollDiscovery(set, get), 10_000);
    },

    stopDiscoveryPolling: () => {
      if (_discoveryInterval) {
        clearInterval(_discoveryInterval);
        _discoveryInterval = null;
      }
    },

    refreshDiscovery: () => _pollDiscovery(set, get),
  };
});

// ---------------------------------------------------------------------------
// Discovery polling helper
// ---------------------------------------------------------------------------

async function _pollDiscovery(
  set: (fn: (s: { discoveredDevices: DiscoveredDevice[]; machines: Machine[] }) => Partial<{ discoveredDevices: DiscoveredDevice[] }>) => void,
  get: () => { machines: Machine[] },
) {
  try {
    const lc = getLocalClient();
    // Backend returns snake_case `device_id`; map to camelCase `deviceId` here.
    const data = await lc.request<{
      devices: Array<{
        device_id: string;
        hostname: string;
        url: string;
        paired: boolean;
        discovered: boolean;
        active_sessions: number | null;
      }>;
    }>("/discovery");
    const { machines } = get();
    const pairedIds = new Set(machines.map((m) => m.deviceId));
    // Only surface devices that aren't already in the paired machines list
    const unpaired: DiscoveredDevice[] = data.devices
      .filter((d) => !pairedIds.has(d.device_id))
      .map((d) => ({
        deviceId: d.device_id,
        hostname: d.hostname,
        url: d.url,
        paired: d.paired,
        discovered: d.discovered,
        active_sessions: d.active_sessions,
      }));
    set(() => ({ discoveredDevices: unpaired }));
  } catch {
    // Discovery endpoint may not yet be reachable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Legacy migration: move apiKey from localStorage to server-side storage
// ---------------------------------------------------------------------------

async function _migrateLegacyKeys(persisted: PersistedMachine[]) {
  const legacy = persisted.filter((m) => m.apiKey);
  if (legacy.length === 0) return;

  const lc = getLocalClient();
  for (const m of legacy) {
    try {
      await lc.request("/discovery/manual", {
        method: "POST",
        body: JSON.stringify({ url: m.url, api_key: m.apiKey, name: m.name }),
      });
      // Swap to proxy client now that key is stored server-side
      _clients.set(m.deviceId, new MachineApiClient("", undefined, m.deviceId));
    } catch {
      // Migration failed for this machine — keep legacy client in place
    }
  }

  // Re-persist without apiKey so legacy format is cleaned up
  const current = useMachineStore.getState().machines;
  persistRemoteMachines(current);
}
