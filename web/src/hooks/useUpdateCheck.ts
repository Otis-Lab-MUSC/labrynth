import { useEffect, useState } from "react";
import { getLocalClient } from "../api/client";

const GITHUB_RELEASE_URL =
  "https://api.github.com/repos/Otis-Lab-MUSC/labrynth/releases/latest";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const DISMISSED_KEY = "reacher-update-dismissed";

interface UpdateInfo {
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

export function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const health = await getLocalClient().probeHealth();
        if (!health?.version) return;

        const res = await fetch(GITHUB_RELEASE_URL, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;

        const release = await res.json();
        const latestTag: string = release.tag_name ?? "";
        const latestVersion = latestTag.replace(/^v/, "");

        if (
          !cancelled &&
          compareVersions(health.version, latestVersion) &&
          !isDismissed(latestVersion)
        ) {
          setUpdate({
            currentVersion: health.version,
            latestVersion,
            downloadUrl: release.html_url ?? "",
          });
        }
      } catch {
        // Network errors are expected (offline, rate-limited) — silently ignore
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function dismiss() {
    if (update) {
      try {
        localStorage.setItem(DISMISSED_KEY, update.latestVersion);
      } catch {
        // localStorage quota or disabled — banner just reappears next session
      }
      setUpdate(null);
    }
  }

  return { update, dismiss };
}
