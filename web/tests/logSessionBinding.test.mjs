// UI log records carry the active session's id. Run (from web/): npm test
import { test, beforeEach, vi } from "vitest";
import assert from "node:assert/strict";

import { useSessionStore } from "../src/store/useSessionStore.ts";
import { log, flush } from "../src/logging/logger.ts";

const sent = [];
vi.stubGlobal("fetch", async (url, init) => {
  if (String(url).endsWith("/api/auth/token")) return new Response(JSON.stringify({ token: "t" }));
  sent.push(...JSON.parse(init.body).records);
  return new Response("{}");
});

const store = () => useSessionStore.getState();

async function loggedSessionId() {
  sent.length = 0;
  // No data payload: redact() checks `instanceof Element`, which Node lacks.
  log("ui.click", undefined, "info", { msg: "ARM" });
  await flush();
  assert.equal(sent.length, 1);
  return sent[0].session_id;
}

function addRealSession(id) {
  useSessionStore.setState((s) => {
    const next = new Map(s.sessions);
    next.set(id, { ...s.sessions.get(s.activeSessionId), id, draft: false });
    return { sessions: next, sessionOrder: [...s.sessionOrder, id] };
  });
}

beforeEach(() => {
  useSessionStore.setState({ sessions: new Map(), activeSessionId: null, sessionOrder: [], uploadProgress: new Map() });
});

test("a record logged with no active session has no session_id", async () => {
  assert.equal(await loggedSessionId(), undefined);
});

test("a draft tab is not a backend session, so records carry no session_id", async () => {
  store().createDraft("m1");
  assert.equal(await loggedSessionId(), undefined);
});

test("records carry the id of the active real session and follow tab switches", async () => {
  store().createDraft("m1");
  addRealSession("sess-a");
  addRealSession("sess-b");
  store().setActive("sess-a");
  assert.equal(await loggedSessionId(), "sess-a");
  store().setActive("sess-b");
  assert.equal(await loggedSessionId(), "sess-b");
  await store().destroySession("sess-b");
  assert.equal(await loggedSessionId(), "sess-a");
});
