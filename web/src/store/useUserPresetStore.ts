import { create } from "zustand";
import type { SessionPreset } from "../components/program/presets/types";

const STORAGE_KEY = "labrynth-user-presets";

function loadPresets(): SessionPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistPresets(presets: SessionPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

interface UserPresetStore {
  userPresets: SessionPreset[];
  savePreset: (preset: SessionPreset) => void;
  updatePreset: (id: string, preset: SessionPreset) => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;
}

export const useUserPresetStore = create<UserPresetStore>((set, get) => ({
  userPresets: loadPresets(),

  savePreset: (preset) => {
    const next = [...get().userPresets, preset];
    persistPresets(next);
    set({ userPresets: next });
  },

  updatePreset: (id, preset) => {
    const next = get().userPresets.map((p) =>
      p.id === id ? { ...preset, id } : p
    );
    persistPresets(next);
    set({ userPresets: next });
  },

  renamePreset: (id, name) => {
    const next = get().userPresets.map((p) =>
      p.id === id ? { ...p, name } : p
    );
    persistPresets(next);
    set({ userPresets: next });
  },

  deletePreset: (id) => {
    const next = get().userPresets.filter((p) => p.id !== id);
    persistPresets(next);
    set({ userPresets: next });
  },
}));
