/**
 * Preload script. Runs in a SANDBOXED renderer: the only runtime imports allowed are `electron`
 * and the `process` global. Do not import ./contracts at runtime (type-only import is erased).
 */

import { contextBridge } from "electron";
import type { LabrynthDesktopBridge } from "./contracts";

const VERSION_PREFIX = "--labrynth-version=";
const versionArg = process.argv.find((arg) => arg.startsWith(VERSION_PREFIX));
const version = versionArg !== undefined ? versionArg.slice(VERSION_PREFIX.length) : "unknown";

const bridge: LabrynthDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  version,
};

// Key must equal BRIDGE_KEY in ./contracts.ts ("labrynthDesktop"). Inlined because a sandboxed
// preload cannot require local modules. Expose nothing beyond this plain data object.
contextBridge.exposeInMainWorld("labrynthDesktop", bridge);
