import { create } from "zustand";
import { log } from "../logging";
import { getLocalClient } from "../api/client";
import {
  canInstallInPlace, describeStatus, encodeDismissal, isOfferDismissed, parseUpdateInfo,
  type UpdateOffer, type UpdateState,
} from "../lib/updateOffer";
import { useTutorialStore } from "./useTutorialStore";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const STATUS_POLL_MS = 1000;
const DISMISSED_KEY = "labrynth-update-dismissed";
const RELEASES_PAGE_URL = "https://github.com/Otis-Lab-MUSC/labrynth/releases";

export interface UpdateInfo extends UpdateOffer {
  downloadUrl: string;
}

interface UpdateStore {
  update: UpdateInfo | null;
  dismiss: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  downloadStatus: UpdateState;
  downloadPercent: number;
  downloadError: string | null;
  startDownload: () => Promise<void>;
  launchInstaller: () => Promise<void>;
}

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _pollIntervalId: ReturnType<typeof setInterval> | null = null;

function readDismissal(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function stopStatusPolling(): void {
  if (_pollIntervalId === null) return;
  clearInterval(_pollIntervalId);
  _pollIntervalId = null;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  update: null,
  downloadStatus: "idle",
  downloadPercent: 0,
  downloadError: null,

  dismiss: () => {
    const { update } = get();
    if (!update) return;
    try {
      localStorage.setItem(DISMISSED_KEY, encodeDismissal(update));
    } catch { /* localStorage unavailable */ }
    set({ update: null });
  },

  startDownload: async () => {
    const { update } = get();
    if (useTutorialStore.getState().demoMode || !update) return;
    if (!canInstallInPlace(update)) {
      window.open(update.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    set({ downloadStatus: "downloading", downloadPercent: 0, downloadError: null });
    try {
      const client = getLocalClient();
      await client.startUpdateDownload();
      stopStatusPolling();
      _pollIntervalId = setInterval(async () => {
        try {
          const progress = describeStatus(await client.getUpdateStatus());
          set({ downloadStatus: progress.state, downloadPercent: progress.percent, downloadError: progress.error });
          if (progress.state === "ready" || progress.state === "error") stopStatusPolling();
        } catch (err) {
          log("update.poll_failed", { error: err }, "warn", { msg: "Update download status poll failed", src: "store/useUpdateStore" });
        }
      }, STATUS_POLL_MS);
    } catch (err) {
      stopStatusPolling();
      set({ downloadStatus: "error", downloadError: err instanceof Error ? err.message : "Download failed" });
    }
  },

  launchInstaller: async () => {
    if (useTutorialStore.getState().demoMode) return;
    set({ downloadStatus: "launching" });
    try {
      await getLocalClient().launchUpdate();
    } catch (err) {
      set({ downloadStatus: "error", downloadError: err instanceof Error ? err.message : "Launch failed" });
    }
  },

  startPolling: () => {
    if (_intervalId !== null) return;

    async function check() {
      try {
        const offer = parseUpdateInfo(await getLocalClient().getUpdateInfo());
        if (offer === null || isOfferDismissed(offer, readDismissal())) return;
        set({ update: { ...offer, downloadUrl: RELEASES_PAGE_URL } });
      } catch (err) {
        log("update.check_failed", { error: err }, "info", { msg: "Update check failed", src: "store/useUpdateStore" });
      }
    }

    check();
    _intervalId = setInterval(check, CHECK_INTERVAL_MS);
  },

  stopPolling: () => {
    if (_intervalId !== null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    stopStatusPolling();
  },
}));

if (import.meta.hot) {
  import.meta.hot.dispose(() => useUpdateStore.getState().stopPolling());
}
