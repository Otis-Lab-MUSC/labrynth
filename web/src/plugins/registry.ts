import type { PluginManifest } from "../types/plugin";
import slmManifest from "./slm-timestamps.json";

export const PLUGIN_REGISTRY: PluginManifest[] = [
  slmManifest as PluginManifest,
];

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
