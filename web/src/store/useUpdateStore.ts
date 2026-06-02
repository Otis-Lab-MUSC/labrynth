import { create } from "zustand";
import { getLocalClient } from "../api/client";
import { useTutorialStore } from "./useTutorialStore";

const GITHUB_RELEASE_URL = "https://api.github.com/repos/Otis-Lab-MUSC/labrynth/releases?per_page=10";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const DISMISSED_KEY = "labrynth-update-dismissed";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
}

interface UpdateInfoResponse {
  currentVersion: string;
  latestVersion: string;
  assetUrl: string | null;
  assetName: string | null;
}

interface DownloadStatusResponse {
  status: string;
  percent: number;
  local_path: string | null;
  error: string | null;
}

function isDismissed(latestVersion: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false; // old plain-string format — treat as not dismissed
    }
    if (typeof parsed !== "object" || parsed === null) return false;
    const { dismissed, asOf } = parsed as { dismissed?: string; asOf?: string };
    return dismissed === latestVersion && asOf === __APP_VERSION__;
  } catch {
    return false;
  }
}

function compareVersions(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split("-")[0].split(".").map(Number);
  const [cMaj, cMin = 0, cPat = 0] = parse(current);
  const [lMaj, lMin = 0, lPat = 0] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

interface UpdateStore {
  update: UpdateInfo | null;
  dismiss: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  downloadStatus: "idle" | "downloading" | "ready" | "error" | "launching";
  downloadPercent: number;
  downloadError: string | null;
  startDownload: () => Promise<void>;
  launchInstaller: () => Promise<void>;
}

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _pollIntervalId: ReturnType<typeof setInterval> | null = null;

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  update: null,
  downloadStatus: "idle",
  downloadPercent: 0,
  downloadError: null,

  dismiss: () => {
    const { update } = get();
    if (update) {
      try {
        localStorage.setItem(
          DISMISSED_KEY,
          JSON.stringify({ dismissed: update.latestVersion, asOf: update.currentVersion }),
        );
      } catch { /* localStorage unavailable */ }
      set({ update: null });
    }
  },

  startDownload: async () => {
    // Guard: no-op in demo mode
    if (useTutorialStore.getState().demoMode) {
      return;
    }

    set({ downloadStatus: "downloading", downloadPercent: 0, downloadError: null });

    try {
      const client = getLocalClient();

      // Fetch update info to get asset URL and name
      const updateInfo = await client.request<UpdateInfoResponse>("/update/info");
      if (!updateInfo.assetUrl || !updateInfo.assetName) {
        throw new Error("No download link available for this platform");
      }

      // Start download
      await client.request("/update/download", {
        method: "POST",
        body: JSON.stringify({
          assetUrl: updateInfo.assetUrl,
          assetName: updateInfo.assetName,
        }),
      });

      // Poll status every 1s
      if (_pollIntervalId !== null) {
        clearInterval(_pollIntervalId);
      }

      _pollIntervalId = setInterval(async () => {
        try {
          const status = await client.request<DownloadStatusResponse>("/update/status");
          set({ downloadPercent: status.percent });

          if (status.status === "ready") {
            set({ downloadStatus: "ready" });
            if (_pollIntervalId !== null) {
              clearInterval(_pollIntervalId);
              _pollIntervalId = null;
            }
          } else if (status.status === "error") {
            set({ downloadStatus: "error", downloadError: status.error || "Download failed" });
            if (_pollIntervalId !== null) {
              clearInterval(_pollIntervalId);
              _pollIntervalId = null;
            }
          }
        } catch (err) {
          console.warn("[useUpdateStore] Status poll failed:", err);
        }
      }, 1000);
    } catch (err) {
      set({
        downloadStatus: "error",
        downloadError: err instanceof Error ? err.message : "Download failed",
      });
      if (_pollIntervalId !== null) {
        clearInterval(_pollIntervalId);
        _pollIntervalId = null;
      }
    }
  },

  launchInstaller: async () => {
    if (useTutorialStore.getState().demoMode) {
      return;
    }

    set({ downloadStatus: "launching" });

    try {
      const client = getLocalClient();
      await client.request("/update/launch", { method: "POST" });
      // Backend will self-shutdown after 2 seconds; frontend stays in launching state
    } catch (err) {
      const message = err instanceof Error ? err.message : "Launch failed";
      set({ downloadStatus: "error", downloadError: message });
    }
  },

  startPolling: () => {
    if (_intervalId !== null) return;

    async function check() {
      try {
        const currentVersion = __APP_VERSION__;
        const res = await fetch(GITHUB_RELEASE_URL, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          if (import.meta.env.DEV) {
            console.warn(`[useUpdateStore] GitHub API returned ${res.status} — update check skipped`);
          }
          return;
        }

        const releases = (await res.json()) as Array<{ tag_name: string; html_url: string; prerelease: boolean }>;
        if (releases.length === 0) return;

        // Filter out prerelease releases; find highest semantic version among the rest
        const nonPrerelease = releases.filter((r) => !r.prerelease);
        if (nonPrerelease.length === 0) return;

        const latestRelease = nonPrerelease.reduce((best, current) => {
          const bestVersion = best.tag_name.replace(/^v/, "");
          const currentVersion = current.tag_name.replace(/^v/, "");
          return compareVersions(bestVersion, currentVersion) ? current : best;
        });

        const latestTag: string = latestRelease.tag_name ?? "";
        const latestVersion = latestTag.replace(/^v/, "");

        if (compareVersions(currentVersion, latestVersion) && !isDismissed(latestVersion)) {
          set({
            update: { currentVersion, latestVersion, downloadUrl: latestRelease.html_url ?? "" },
          });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[useUpdateStore] update check failed:", err);
        }
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
  },
}));

if (import.meta.hot) {
  import.meta.hot.dispose(() => useUpdateStore.getState().stopPolling());
}
