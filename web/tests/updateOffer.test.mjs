// Pure logic for the in-app update banner. Run (from web/): npm test
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  parseUpdateInfo, isOfferDismissed, encodeDismissal, describeStatus, canInstallInPlace,
} from "../src/lib/updateOffer.ts";

const info = (over = {}) => ({
  currentVersion: "3.0.1-beta.16",
  latestVersion: "3.0.1-beta.17",
  updateAvailable: true,
  channel: "prerelease",
  assetName: "labrynth-linux.tar.gz",
  assetUrl: "https://example.test/a.tar.gz",
  sha256Url: "https://example.test/SHA256SUMS",
  applyMode: "restart",
  ...over,
});

test("an available update becomes an offer", () => {
  assert.deepEqual(parseUpdateInfo(info()), {
    currentVersion: "3.0.1-beta.16",
    latestVersion: "3.0.1-beta.17",
    applyMode: "restart",
  });
});

test("no offer when the backend says nothing is newer", () => {
  assert.equal(parseUpdateInfo(info({ updateAvailable: false })), null);
});

test("no offer when the latest version or the asset is missing", () => {
  assert.equal(parseUpdateInfo(info({ latestVersion: null })), null);
  assert.equal(parseUpdateInfo(info({ assetUrl: null })), null);
});

test("a beta is offered a newer beta; the client does not compare versions itself", () => {
  const offer = parseUpdateInfo(info({ currentVersion: "3.0.1-beta.15", latestVersion: "3.0.1-beta.16" }));
  assert.equal(offer?.latestVersion, "3.0.1-beta.16");
});

test("junk replies give no offer", () => {
  for (const junk of [null, undefined, 7, "x", [], {}]) assert.equal(parseUpdateInfo(junk), null);
});

test("an unknown apply mode is treated as manual", () => {
  assert.equal(parseUpdateInfo(info({ applyMode: "teleport" }))?.applyMode, "manual");
});

test("only restart mode installs in place", () => {
  assert.equal(canInstallInPlace({ currentVersion: "a", latestVersion: "b", applyMode: "restart" }), true);
  assert.equal(canInstallInPlace({ currentVersion: "a", latestVersion: "b", applyMode: "manual" }), false);
});

test("a dismissal hides the same version only while the running version is unchanged", () => {
  const offer = { currentVersion: "3.0.1-beta.16", latestVersion: "3.0.1-beta.17", applyMode: "restart" };
  const stored = encodeDismissal(offer);
  assert.equal(isOfferDismissed(offer, stored), true);
  assert.equal(isOfferDismissed({ ...offer, latestVersion: "3.0.1-beta.18" }, stored), false);
  assert.equal(isOfferDismissed({ ...offer, currentVersion: "3.0.1-beta.17" }, stored), false);
});

test("a bad stored dismissal is ignored", () => {
  const offer = { currentVersion: "a", latestVersion: "b", applyMode: "restart" };
  for (const bad of [null, "", "not json", "7", "null", '"plain-string"']) {
    assert.equal(isOfferDismissed(offer, bad), false);
  }
});

test("status maps to the banner state", () => {
  assert.deepEqual(describeStatus({ status: "downloading", percent: 40, error: null }), {
    state: "downloading", percent: 40, error: null,
  });
  assert.deepEqual(describeStatus({ status: "ready", percent: 100, error: null }), {
    state: "ready", percent: 100, error: null,
  });
  assert.deepEqual(describeStatus({ status: "launching", percent: 100, error: null }), {
    state: "launching", percent: 100, error: null,
  });
});

test("an error status carries its message, with a fallback", () => {
  assert.equal(describeStatus({ status: "error", percent: 3, error: "bad signature" }).error, "bad signature");
  assert.equal(describeStatus({ status: "error", percent: 3, error: null }).error, "Update failed");
});

test("percent is clamped and an unknown status falls back to idle", () => {
  assert.equal(describeStatus({ status: "downloading", percent: 250, error: null }).percent, 100);
  assert.equal(describeStatus({ status: "downloading", percent: -4, error: null }).percent, 0);
  assert.equal(describeStatus({ status: "???", percent: 5, error: null }).state, "idle");
});
