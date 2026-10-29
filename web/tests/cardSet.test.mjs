// Run (from web/): node --test tests/*.test.mjs   (Node >= 22.18 strips the TypeScript types itself)
import test from "node:test";
import assert from "node:assert/strict";
import { buildCardCommands, firstInvalid, sendAll, cardSyncState, fieldsSignature, showInvalid, invalidLabels, describeMissingFields, needsSync, asUpload, uploadState, isUploadPending, uploadSignature, describeUnsent, isUnsent } from "../src/lib/cardSet.ts";

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

test("sync state: never sent, in sync, edited", () => {
  const f = [ok(1, 10), ok(2, 20)];
  assert.equal(cardSyncState(f, null), "not-sent");
  const sig = fieldsSignature(f);
  assert.equal(cardSyncState(f, sig), "synced");
  assert.equal(cardSyncState([ok(1, 10), ok(2, 21)], sig), "unsent-changes");
});

test("sync state: an external flag is authoritative", () => {
  const f = [ok(1, 10)];
  const sig = fieldsSignature(f);
  assert.equal(cardSyncState(f, null, true), "synced");
  assert.equal(cardSyncState(f, null, false), "not-sent");
  assert.equal(cardSyncState(f, sig, false), "unsent-changes");
});


test("red outline only when armed and invalid", () => {
  assert.equal(showInvalid(true, false), true);
  assert.equal(showInvalid(false, false), false);
  assert.equal(showInvalid(true, true), false);
  assert.equal(showInvalid(false, true), false);
});

test("invalidLabels lists every bad field in card order", () => {
  assert.deepEqual(invalidLabels([bad(1, 0, "Freq (Hz)"), ok(2, 5, "Pin"), bad(3, 0, "Dur (ms)")]), ["Freq (Hz)", "Dur (ms)"]);
  assert.deepEqual(invalidLabels([bad(1, 0)]), ["a field"]);
  assert.deepEqual(invalidLabels([ok(1, 1)]), []);
});

test("describeMissingFields joins one, two and three names", () => {
  assert.equal(describeMissingFields([]), "");
  assert.equal(describeMissingFields(["Dur (ms)"]), "Fill in Dur (ms), then upload.");
  assert.equal(describeMissingFields(["Freq (Hz)", "Dur (ms)"]), "Fill in Freq (Hz) and Dur (ms), then upload.");
  assert.equal(describeMissingFields(["A", "B", "C"]), "Fill in A, B and C, then upload.");
});

test("needsSync flags edits always, and never-sent values only on an armed device", () => {
  assert.equal(needsSync("unsent-changes", false), true);
  assert.equal(needsSync("not-sent", true), true);
  assert.equal(needsSync("not-sent", false), false);
  assert.equal(needsSync("synced", true), false);
});


test("a field upload tracks its own value", () => {
  const f = asUpload(ok(371, 4000, "Freq (Hz)"));
  assert.equal(f.id, "371");
  assert.equal(uploadState(f, null), "not-sent");
  const sig = uploadSignature(f);
  assert.equal(uploadState(f, sig), "synced");
  assert.equal(uploadState(asUpload(ok(371, 5000, "Freq (Hz)")), sig), "unsent-changes");
});

test("a shared-register upload compares on its own signature", () => {
  const rh = { id: "timeout", label: "Timeout (ms)", fields: [ok(1074, 20)], signature: "20" };
  const lh = { id: "timeout", label: "Timeout (ms)", fields: [ok(1374, 20)], signature: "20" };
  assert.equal(uploadState(lh, uploadSignature(rh)), "synced");
});



test("an edited field that was never uploaded counts as changed", () => {
  const base = uploadSignature(asUpload(ok(201, 1)));
  assert.equal(uploadState(asUpload(ok(201, 1)), null, base), "not-sent");
  assert.equal(uploadState(asUpload(ok(201, 5)), null, base), "unsent-changes");
  assert.equal(isUploadPending({ ...asUpload(ok(201, 5)), required: true }, null, false, base), true);
});

const req = (f) => ({ ...asUpload(f), required: true });

test("required fields: amber when blank on an armed card, changed, or armed and never uploaded", () => {
  assert.equal(isUploadPending(req(ok(372, 1000)), null, false), false);
  assert.equal(isUploadPending(req(ok(372, 1000)), null, true), true);
  assert.equal(isUploadPending(req(bad(372, 0)), null, true), true);
  assert.equal(isUploadPending(req(bad(372, 0)), null, false), false);
  assert.equal(isUploadPending(req(ok(372, 5)), uploadSignature(req(ok(372, 2))), false), true);
  assert.equal(isUploadPending(req(ok(372, 5)), uploadSignature(req(ok(372, 5))), true), false);
});

test("optional fields never go amber, but a changed value is listed as unsent", () => {
  const delay = asUpload(ok(377, 250, "Delay (ms)"));
  const base = uploadSignature(asUpload(ok(377, 0)));
  assert.equal(isUploadPending(delay, null, true, base), false);
  assert.equal(isUnsent(delay, null, true, base), true);
  assert.equal(isUnsent(asUpload(ok(377, 0)), null, true, base), false);
  assert.equal(isUnsent(delay, uploadSignature(delay), true, base), false);
});

test("every amber required field is also listed as unsent; invalid ones are not", () => {
  assert.equal(isUnsent(req(ok(371, 4000)), null, true), true);
  assert.equal(isUnsent(req(bad(371, 0)), null, true), false);
});

test("describeUnsent", () => {
  assert.equal(describeUnsent([]), "");
  assert.equal(describeUnsent(["Pin"]), "Unsent changes: Pin. Press the upload button beside each.");
  assert.equal(describeUnsent(["Delay (ms)", "Seed", "Pin"]), "Unsent changes: Delay (ms), Seed and Pin. Press the upload button beside each.");
});
