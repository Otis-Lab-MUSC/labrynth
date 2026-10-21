// Run: node --test tests/   (Node >= 22.18 strips the TypeScript types itself)
import test from "node:test";
import assert from "node:assert/strict";
import { buildCardCommands, firstInvalid, sendAll } from "../src/lib/cardSet.ts";

const ok = (code, value, label) => ({ code, value, valid: true, label });
const bad = (code, value, label) => ({ code, value, valid: false, label });

test("commands keep field order", () => {
  const cmds = buildCardCommands([ok(1, 10), ok(2, 20), ok(3, 0)]);
  assert.deepEqual(cmds, [[1, 10], [2, 20], [3, 0]]);
});

test("null when any field is invalid, firstInvalid names the first one", () => {
  const fields = [ok(1, 10), bad(2, 99, "Duration"), bad(3, 5, "Pin")];
  assert.equal(buildCardCommands(fields), null);
  assert.equal(firstInvalid(fields), "Duration");
});

test("firstInvalid falls back to 'a field' and returns null when all valid", () => {
  assert.equal(firstInvalid([bad(1, 0)]), "a field");
  assert.equal(firstInvalid([ok(1, 0, "Pin")]), null);
});

test("sendAll stops at first rejection and reports sent count", async () => {
  const calls = [];
  const send = async (code) => {
    calls.push(code);
    if (code === 2) throw new Error("serial dropped");
  };
  const result = await sendAll(send, [[1, 1], [2, 2], [3, 3]]);
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(result, { sent: 1, error: "serial dropped" });
});

test("sendAll stops at first synchronous throw", async () => {
  const calls = [];
  const send = (code) => {
    calls.push(code);
    if (code === 1) throw "boom";
  };
  const result = await sendAll(send, [[1, 1], [2, 2]]);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(result, { sent: 0, error: "boom" });
});

test("sendAll reports full success", async () => {
  const result = await sendAll(async () => undefined, [[1, 1], [2, 2]]);
  assert.deepEqual(result, { sent: 2, error: null });
});

test("sendAll treats an undefined return (no client) as not sent", async () => {
  const calls = [];
  const send = (code) => {
    calls.push(code);
    return undefined;
  };
  const result = await sendAll(send, [[1, 1], [2, 2]]);
  assert.deepEqual(calls, [1]);
  assert.deepEqual(result, { sent: 0, error: "not connected" });
  assert.equal(result.error === null, false);
});

test("sendAll awaits each send before starting the next", async () => {
  const log = [];
  const send = async (code, value) => {
    log.push(`start ${code}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    log.push(`end ${code}`);
    return value;
  };
  await sendAll(send, [[1, 10], [2, 20], [3, 30]]);
  assert.deepEqual(log, [
    "start 1", "end 1",
    "start 2", "end 2",
    "start 3", "end 3",
  ]);
});
