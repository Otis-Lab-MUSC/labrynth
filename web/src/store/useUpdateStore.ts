import { create } from "zustand";

const GITHUB_RELEASE_URL = "https://api.github.com/repos/Otis-Lab-MUSC/labrynth/releases/latest";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const DISMISSED_KEY = "labrynth-update-dismissed";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
}

function isDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === version;
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
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  update: null,

  dismiss: () => {
    const { update } = get();
    if (update) {
      try {
        localStorage.setItem(DISMISSED_KEY, update.latestVersion);
      } catch { /* localStorage unavailable */ }
      set({ update: null });
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
        if (!res.ok) return;

        const release = await res.json();
        const latestTag: string = release.tag_name ?? "";
        const latestVersion = latestTag.replace(/^v/, "");

        if (compareVersions(currentVersion, latestVersion) && !isDismissed(latestVersion)) {
          set({
            update: { currentVersion, latestVersion, downloadUrl: release.html_url ?? "" },
          });
        }
      } catch { /* network errors — silently ignore */ }
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
