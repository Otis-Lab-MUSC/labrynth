import { test, beforeEach } from "vitest";
import assert from "node:assert/strict";
import {
  loadPersistedMachines,
  persistRemoteMachines,
  toPairedMachine,
  toPersistedRemoteMachine,
} from "../src/lib/machineStorage.ts";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const local = { deviceId: "L", name: "Local", hostname: "h", url: "", isLocal: true, paired: true, online: true, lastSeen: null };
const remote = { deviceId: "R", name: "Rig", hostname: "rig", url: "http://rig:6229", isLocal: false, paired: true, online: true, lastSeen: null };

beforeEach(() => store.clear());

test("only remote machines are persisted, without online state", () => {
  persistRemoteMachines([local, remote]);
  assert.deepEqual(loadPersistedMachines(), [
    { deviceId: "R", name: "Rig", url: "http://rig:6229", hostname: "rig" },
  ]);
});

test("persisting no remote machines clears the stored entry", () => {
  persistRemoteMachines([remote]);
  persistRemoteMachines([local]);
  assert.deepEqual(loadPersistedMachines(), []);
});

test("corrupt storage loads as an empty list", () => {
  store.set("reacher-machines", "{not json");
  assert.deepEqual(loadPersistedMachines(), []);
});

test("persisted entries rehydrate offline and paired", () => {
  const machine = toPersistedRemoteMachine({ deviceId: "R", name: "Rig", url: "u", hostname: "rig" });
  assert.equal(machine.online, false);
  assert.equal(machine.paired, true);
  assert.equal(machine.isLocal, false);
  assert.equal(machine.lastSeen, null);
});

test("a pairing result becomes an online remote machine", () => {
  const machine = toPairedMachine({ device_id: "R", name: "Rig", hostname: "rig", url: "u" });
  assert.equal(machine.deviceId, "R");
  assert.equal(machine.online, true);
  assert.equal(machine.isLocal, false);
});
