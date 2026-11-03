import type { DiscoveredDevice, Machine } from "../types";
import { MachineApiClient } from "../api/client";
import {
  createProxyClient,
  getLocalClient,
  setCachedClient,
} from "../lib/machineClients";
import { persistRemoteMachines, type PersistedMachine } from "../lib/machineStorage";

export interface DiscoverySlice {
  discoveredDevices: DiscoveredDevice[];
  machines: Machine[];
}

type SetDiscovery = (fn: (s: DiscoverySlice) => Partial<DiscoverySlice>) => void;
type GetMachines = () => { machines: Machine[] };

interface DiscoveryEntry {
  device_id: string;
  hostname: string;
  url: string;
  paired: boolean;
  discovered: boolean;
  active_sessions: number | null;
  name?: string;
}

function toRestoredMachine(entry: DiscoveryEntry): Machine {
  return {
    deviceId: entry.device_id,
    name: entry.name || entry.hostname,
    hostname: entry.hostname,
    url: entry.url,
    isLocal: false,
    paired: true,
    online: entry.discovered,
    lastSeen: entry.discovered ? new Date().toISOString() : null,
  };
}

function toDiscoveredDevice(entry: DiscoveryEntry): DiscoveredDevice {
  return {
    deviceId: entry.device_id,
    hostname: entry.hostname,
    url: entry.url,
    paired: entry.paired,
    discovered: entry.discovered,
    active_sessions: entry.active_sessions,
  };
}

/** Restore machines the server knows are paired but the frontend lost, e.g. after localStorage was cleared. */
function restoreLostMachines(entries: DiscoveryEntry[], pairedIds: Set<string>, set: SetDiscovery): void {
  const restored = entries.filter((d) => d.paired && !pairedIds.has(d.device_id)).map(toRestoredMachine);
  if (restored.length === 0) return;
  for (const machine of restored) {
    setCachedClient(machine.deviceId, createProxyClient(machine.deviceId));
    pairedIds.add(machine.deviceId);
  }
  set((s) => {
    const next = [...s.machines, ...restored];
    persistRemoteMachines(next);
    return { machines: next };
  });
}

export async function pollDiscovery(set: SetDiscovery, get: GetMachines): Promise<void> {
  try {
    const data = await getLocalClient().request<{ devices: DiscoveryEntry[] }>("/discovery");
    const pairedIds = new Set(get().machines.map((m) => m.deviceId));
    restoreLostMachines(data.devices, pairedIds, set);
    const unpaired = data.devices
      .filter((d) => !d.paired && !pairedIds.has(d.device_id))
      .map(toDiscoveredDevice);
    set(() => ({ discoveredDevices: unpaired }));
  } catch {
    // Discovery endpoint may not yet be reachable; the next poll retries.
  }
}

/** Move apiKeys stored in localStorage to server-side storage, then re-persist without them. */
export async function migrateLegacyKeys(
  persisted: PersistedMachine[],
  getMachines: () => Machine[],
): Promise<void> {
  const legacy = persisted.filter((m) => m.apiKey);
  if (legacy.length === 0) return;

  const localClient = getLocalClient();
  for (const entry of legacy) {
    try {
      await localClient.request("/discovery/manual", {
        method: "POST",
        body: JSON.stringify({ url: entry.url, api_key: entry.apiKey, name: entry.name }),
      });
      setCachedClient(entry.deviceId, createProxyClient(entry.deviceId));
    } catch {
      // Keep the direct client in place for this machine; migration retries on next load.
    }
  }
  persistRemoteMachines(getMachines());
}

/** Seed the client cache for machines persisted by earlier builds that may still carry an apiKey. */
export function seedPersistedClients(persisted: PersistedMachine[]): void {
  for (const entry of persisted) {
    setCachedClient(
      entry.deviceId,
      entry.apiKey ? new MachineApiClient(entry.url, entry.apiKey) : createProxyClient(entry.deviceId),
    );
  }
}
