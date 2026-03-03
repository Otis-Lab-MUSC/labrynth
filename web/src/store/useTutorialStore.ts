import { create } from "zustand";
import type { Panel } from "./useNavigationStore";

export interface TutorialStep {
  id: string;
  panel: Panel | null;
  target: string;
  title: string;
  content: string;
  placement: "top" | "bottom" | "left" | "right" | "center";
}

interface TutorialStore {
  // Tour
  active: boolean;
  activeTourId: string | null;
  currentStepIndex: number;
  steps: TutorialStep[];
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  endTour: () => void;

  // Demo mode
  demoMode: boolean;
  setDemoMode: (on: boolean) => void;

  // Help panel
  helpOpen: boolean;
  helpSection: string | null;
  setHelpOpen: (open: boolean) => void;
  setHelpSection: (section: string | null) => void;

  // Persistence
  completedTours: string[];
  markTourComplete: (tourId: string) => void;
  hasCompleted: (tourId: string) => boolean;
}

const STORAGE_KEY = "labrynth-tutorial-completed";

function loadCompleted(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCompleted(tours: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tours));
}

// Tour registry — lazy import to avoid circular deps
const tourRegistry: Record<string, () => TutorialStep[]> = {};

export function registerTour(id: string, factory: () => TutorialStep[]) {
  tourRegistry[id] = factory;
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  active: false,
  activeTourId: null,
  currentStepIndex: 0,
  steps: [],

  startTour: (tourId) => {
    const factory = tourRegistry[tourId];
    if (!factory) return;
    set({ active: true, activeTourId: tourId, currentStepIndex: 0, steps: factory() });
  },

  nextStep: () => {
    const { currentStepIndex, steps } = get();
    if (currentStepIndex < steps.length - 1) {
      set({ currentStepIndex: currentStepIndex + 1 });
    } else {
      get().endTour();
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      set({ currentStepIndex: currentStepIndex - 1 });
    }
  },

  skipTour: () => {
    set({ active: false, activeTourId: null, currentStepIndex: 0, steps: [] });
  },

  endTour: () => {
    const { activeTourId } = get();
    if (activeTourId) {
      get().markTourComplete(activeTourId);
    }
    set({ active: false, activeTourId: null, currentStepIndex: 0, steps: [] });
  },

  demoMode: false,
  setDemoMode: (on) => set({ demoMode: on }),

  helpOpen: false,
  helpSection: null,
  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpSection: (section) => set({ helpSection: section, helpOpen: true }),

  completedTours: loadCompleted(),

  markTourComplete: (tourId) => {
    const { completedTours } = get();
    if (!completedTours.includes(tourId)) {
      const next = [...completedTours, tourId];
      saveCompleted(next);
      set({ completedTours: next });
    }
  },

  hasCompleted: (tourId) => get().completedTours.includes(tourId),
}));
