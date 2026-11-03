import { MachineApiClient } from "../api/client";
import type { Machine } from "../types";

/** Sentinel used before the local machine's real device_id is known. */
export const LOCAL_PLACEHOLDER_ID = "__local__";

// Lives outside Zustand state so store updates don't re-create clients on every render.
const clients = new Map<string, MachineApiClient>();

let localClient: MachineApiClient | null = null;

/** Same-origin client used for discovery and pairing calls. */
export function getLocalClient(): MachineApiClient {
  return (localClient ??= new MachineApiClient(""));
}

export function setLocalClient(client: MachineApiClient): void {
  localClient = client;
}

export function getCachedClient(deviceId: string): MachineApiClient | undefined {
  return clients.get(deviceId);
}

export function setCachedClient(deviceId: string, client: MachineApiClient): void {
  clients.set(deviceId, client);
}

export function deleteCachedClient(deviceId: string): void {
  clients.delete(deviceId);
}

/** Route calls through the local server, which holds the remote API key. */
export function createProxyClient(deviceId: string): MachineApiClient {
  return new MachineApiClient("", undefined, deviceId);
}

export function ensureClient(machine: Machine): MachineApiClient {
  const existing = clients.get(machine.deviceId);
  if (existing) return existing;
  const client = machine.isLocal ? new MachineApiClient("") : createProxyClient(machine.deviceId);
  clients.set(machine.deviceId, client);
  return client;
}
