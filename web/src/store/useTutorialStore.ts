import { create } from "zustand";
import type { Panel } from "./useNavigationStore";
import type { Session } from "../types";
import { useSessionStore } from "./useSessionStore";

export interface TutorialStep {
  id: string;
  panel: Panel | null;
  target: string;
  title: string;
  content: string;
  placement: "top" | "bottom" | "left" | "right" | "center";
  interactive?: boolean;
  section?: string;
  summary?: (session: Session) => string | null;
  /** If present, "Next" is disabled until predicate returns true. */
  gate?: (session: Session | null) => boolean;
  /** If present and returns false, step is skipped when navigating. */
  visible?: (session: Session | null) => boolean;
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
  goToStep: (index: number) => void;
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
    const sessionStore = useSessionStore.getState();
    const session = sessionStore.activeSessionId
      ? sessionStore.sessions.get(sessionStore.activeSessionId) ?? null
      : null;
    let next = currentStepIndex + 1;
    while (next < steps.length && steps[next].visible && !steps[next].visible!(session)) {
      next++;
    }
    if (next < steps.length) {
      set({ currentStepIndex: next });
    } else {
      get().endTour();
    }
  },

  prevStep: () => {
    const { currentStepIndex, steps } = get();
    const sessionStore = useSessionStore.getState();
    const session = sessionStore.activeSessionId
      ? sessionStore.sessions.get(sessionStore.activeSessionId) ?? null
      : null;
    let prev = currentStepIndex - 1;
    while (prev >= 0 && steps[prev].visible && !steps[prev].visible!(session)) {
      prev--;
    }
    if (prev >= 0) {
      set({ currentStepIndex: prev });
    }
  },

  goToStep: (index) => {
    const { steps } = get();
    if (index >= 0 && index < steps.length) {
      set({ currentStepIndex: index });
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

  demoMode: import.meta.env.VITE_DEMO_SITE === "true",
  setDemoMode: (on) => {
    if (on && import.meta.env.VITE_DEMO_SITE !== "true") return;
    set({ demoMode: on });
  },

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
