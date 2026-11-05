import type { Machine } from "../types";

const STORAGE_KEY = "reacher-machines";

/** Persisted shape for remote machines; apiKey is read only to migrate old entries. */
export interface PersistedMachine {
  deviceId: string;
  name: string;
  url: string;
  hostname: string;
  apiKey?: string;
}

/** Fields the backend returns after pairing or manually adding a machine. */
export interface PairResult {
  device_id: string;
  hostname: string;
  url: string;
  name: string;
}

export function persistRemoteMachines(machines: Machine[]): void {
  const remote = machines
    .filter((m) => !m.isLocal)
    .map(({ deviceId, name, url, hostname }) => ({ deviceId, name, url, hostname }));
  if (remote.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function loadPersistedMachines(): PersistedMachine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Build the offline remote machine rehydrated from localStorage. */
export function toPersistedRemoteMachine(entry: PersistedMachine): Machine {
  return {
    deviceId: entry.deviceId,
    name: entry.name,
    url: entry.url,
    hostname: entry.hostname,
    isLocal: false,
    paired: true,
    online: false,
    lastSeen: null,
  };
}

/** Build the online remote machine that a pairing call just returned. */
export function toPairedMachine(result: PairResult): Machine {
  return {
    deviceId: result.device_id,
    name: result.name,
    hostname: result.hostname,
    url: result.url,
    isLocal: false,
    paired: true,
    online: true,
    lastSeen: new Date().toISOString(),
  };
}
