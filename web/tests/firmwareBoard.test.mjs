// Run (from web/): node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { boardFromParadigm, resolveBoard } from "../src/lib/firmwareBoard.ts";

test("paradigm name implies the board", () => {
  assert.equal(boardFromParadigm("fr"), "mega");
  assert.equal(boardFromParadigm("pavlovian"), "mega");
  assert.equal(boardFromParadigm("fr_lite"), "uno");
  assert.equal(boardFromParadigm("omission_lite"), "uno");
  assert.equal(boardFromParadigm("mystery"), null);
  assert.equal(boardFromParadigm(null), null);
});

test("USB detection wins, then the connect reply, then the running firmware", () => {
  assert.equal(resolveBoard("mega", "uno", "fr_lite"), "mega");
  assert.equal(resolveBoard(null, "mega", "fr_lite"), "mega");
  assert.equal(resolveBoard(null, null, "fr"), "mega");
  assert.equal(resolveBoard("clone", null, "fr_lite"), "uno");
  assert.equal(resolveBoard(null, null, null), null);
});
