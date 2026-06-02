import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PluginManifest } from "../types/plugin";

interface PluginStore {
  installedPluginIds: string[];
  installPlugin: (manifest: PluginManifest) => void;
  uninstallPlugin: (id: string) => void;
  isInstalled: (id: string) => boolean;
}

export const usePluginStore = create<PluginStore>()(
  persist(
    (set, get) => ({
      installedPluginIds: [],
      installPlugin: (manifest) =>
        set((s) => ({
          installedPluginIds: s.installedPluginIds.includes(manifest.id)
            ? s.installedPluginIds
            : [...s.installedPluginIds, manifest.id],
        })),
      uninstallPlugin: (id) =>
        set((s) => ({
          installedPluginIds: s.installedPluginIds.filter((p) => p !== id),
        })),
      isInstalled: (id) => get().installedPluginIds.includes(id),
    }),
    { name: "labrynth-plugins" },
  ),
);
