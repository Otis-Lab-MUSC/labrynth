/**
 * sessionClient.ts
 *
 * Bridges the session store and machine store to retrieve the correct
 * MachineApiClient for a given session ID.  Kept in a separate file to
 * avoid circular imports between useMachineStore ↔ useSessionStore.
 */

import type { MachineApiClient } from "./client";
import { useMachineStore } from "../store/useMachineStore";
import { useSessionStore } from "../store/useSessionStore";

/**
 * Return the API client for the machine that owns the given session.
 * Returns null if the session or machine is not found.
 */
export function getClientForSession(sessionId: string): MachineApiClient | null {
  const sess = useSessionStore.getState().sessions.get(sessionId);
  if (!sess) return null;
  return useMachineStore.getState().getClient(sess.machineId);
}
