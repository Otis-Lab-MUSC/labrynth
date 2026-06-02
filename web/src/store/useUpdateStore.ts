import { create } from "zustand";

const GITHUB_RELEASE_URL = "https://api.github.com/repos/Otis-Lab-MUSC/labrynth/releases/latest";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const DISMISSED_KEY = "labrynth-update-dismissed";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
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
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  update: null,

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

        const release = await res.json();
        const latestTag: string = release.tag_name ?? "";
        const latestVersion = latestTag.replace(/^v/, "");

        if (compareVersions(currentVersion, latestVersion) && !isDismissed(latestVersion)) {
          set({
            update: { currentVersion, latestVersion, downloadUrl: release.html_url ?? "" },
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
