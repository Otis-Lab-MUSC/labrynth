/**
 * Bundle the current run's diagnostic log for a bug report.
 *
 * The viewer sandbox blocks script-initiated downloads in some contexts, so the
 * blob is handed over through a real anchor click.
 */

import { flush, log } from "./logger";

async function authHeader(): Promise<Record<string, string>> {
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) return {};
    const data = await res.json();
    return data?.token ? { Authorization: `Bearer ${data.token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Download the active run as a ZIP. Flushes buffered UI records first, so the
 * actions leading up to the report are actually in the file.
 */
export async function downloadDiagnostics(deviceId?: string): Promise<void> {
  log("ui.diagnostics_export", { deviceId }, "info", {
    msg: "Diagnostics export requested",
    src: "AboutModal",
  });
  await flush();

  const base = deviceId ? `/api/proxy/${deviceId}/api/logs/export` : "/api/logs/export";
  const res = await fetch(base, { headers: await authHeader() });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `reacher-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoked on the next tick so the download has taken the reference.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
