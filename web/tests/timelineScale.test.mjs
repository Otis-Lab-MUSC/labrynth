// Run: node --test tests/   (Node >= 22.18 strips the TypeScript types itself)
import test from "node:test";
import assert from "node:assert/strict";
import { fixedTicks, formatTickLabel } from "../src/lib/timelineScale.ts";

const gaps = (ticks) => ticks.slice(1).map((tick, i) => tick.t - ticks[i].t);

test("tick spacing is 10s early and late", () => {
  for (const span of [30, 1800]) {
    const ticks = fixedTicks(span);
    assert.ok(ticks.length > 1);
    assert.deepEqual(new Set(gaps(ticks)), new Set([10]), `span ${span}`);
  }
});

test("labels only on multiples of 30", () => {
  const ticks = fixedTicks(1800);
  for (const { t, label } of ticks) {
    assert.equal(label, t % 30 === 0, `t=${t}`);
  }
  assert.ok(ticks.some((tick) => tick.label));
});

test("fixedTicks covers up to floor(span/10)*10 inclusive", () => {
  const ticks = fixedTicks(35);
  assert.equal(ticks.at(-1).t, 30);
  assert.equal(ticks[0].t, 0);
});

test("fixedTicks(0) is a single labelled tick at zero", () => {
  assert.deepEqual(fixedTicks(0), [{ t: 0, label: true }]);
  assert.deepEqual(fixedTicks(-5), [{ t: 0, label: true }]);
});

test("formatTickLabel uses unpadded minutes and padded seconds", () => {
  assert.equal(formatTickLabel(0), "0:00");
  assert.equal(formatTickLabel(30), "0:30");
  assert.equal(formatTickLabel(90), "1:30");
  assert.equal(formatTickLabel(3600), "60:00");
});
