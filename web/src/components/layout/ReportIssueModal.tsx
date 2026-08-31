import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, X } from "lucide-react";
import { getLocalClient, type IssuePrefill } from "../../api/client";
import { DemoMachineApiClient } from "../../api/demoClient";
import { flush, log } from "../../logging";
import { useReportStore } from "../../store/useReportStore";
import { LOCAL_PLACEHOLDER_ID, useMachineStore } from "../../store/useMachineStore";
import { useTutorialStore } from "../../store/useTutorialStore";

type Severity = "" | "minor" | "moderate" | "critical";
type Repo = "labrynth" | "reacher";

export function ReportIssueModal() {
  const open = useReportStore((s) => s.open);
  const prefillText = useReportStore((s) => s.prefill);
  const closeReport = useReportStore((s) => s.closeReport);

  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [severity, setSeverity] = useState<Severity>("");
  const [repo, setRepo] = useState<Repo>("labrynth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single-step flow: form → pre-filled GitHub link the user opens and submits.
  const [prefill, setPrefill] = useState<IssuePrefill | null>(null);
  const [copied, setCopied] = useState(false);

  const closeRef = useRef<HTMLButtonElement>(null);
  const demoMode = useTutorialStore((s) => s.demoMode);

  function apiClient() {
    if (useTutorialStore.getState().demoMode) {
      return useMachineStore.getState().getClient(LOCAL_PLACEHOLDER_ID) ?? new DemoMachineApiClient();
    }
    return useMachineStore.getState().getClient(LOCAL_PLACEHOLDER_ID) ?? getLocalClient();
  }

  useEffect(() => {
    if (!open) return;
    setDescription(prefillText);
    setSteps("");
    setSeverity("");
    setRepo("labrynth");
    setError(null);
    setPrefill(null);
    setCopied(false);
    closeRef.current?.focus();
  }, [open, prefillText]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeReport();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, closeReport]);

  if (!open) return null;

  const canSubmit = description.trim().length > 0 && !busy;
  const markdown = prefill ? `# ${prefill.title}\n\n${prefill.body}` : "";

  async function handlePrepare() {
    setBusy(true);
    setError(null);
    log("ui.issue_report", { repo, severity, demoMode }, "info", {
      msg: "Issue report prepared",
      src: "ReportIssueModal",
    });
    try {
      // The backend attaches a slice of this run's log, so make sure the
      // buffered client-side entries have landed before it reads them.
      await flush();
      const data = await apiClient().getIssuePrefill({
        description: description.trim(),
        steps: steps.trim(),
        severity,
        repo,
        app_version: __APP_VERSION__,
      });
      setPrefill(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the report");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={() => {
        if (!busy) closeReport();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-issue-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-theme-border bg-panel p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="report-issue-title" className="text-base font-semibold text-theme-text">
            {prefill ? "Review on GitHub" : "Report an issue"}
          </h3>
          <button
            ref={closeRef}
            onClick={closeReport}
            disabled={busy}
            className="rounded p-1 opacity-50 transition hover:bg-accent/10 hover:opacity-100 disabled:opacity-30"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {prefill ? (
          <div className="space-y-3">
            <p className="text-xs text-theme-text/60">
              Your report is ready. Continuing opens a pre-filled new issue on the{" "}
              <span className="font-medium">{prefill.repo}</span> repository in a new tab — review
              it there and press <span className="font-medium">Create</span> to submit it under
              your own GitHub account. Nothing is posted until you do.
            </p>
            <p className="text-xs text-amber-500/90">
              Both repositories are public. Remove any subject IDs, doses, or file paths you
              don&apos;t want public before submitting.
            </p>

            <div className="rounded border border-theme-border bg-black/20 p-3">
              <p className="text-xs font-medium text-theme-text">{prefill.title}</p>
              <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-theme-text/70">
                {prefill.body}
              </pre>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setPrefill(null);
                  setError(null);
                }}
                className="rounded px-3 py-1.5 text-sm text-theme-text hover:bg-accent/10"
              >
                Back
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded border border-theme-border px-3 py-1.5 text-xs text-theme-text/70 transition hover:border-accent hover:text-accent"
              >
                <Copy size={11} />
                {copied ? "Copied" : "Copy markdown"}
              </button>
              <a
                href={prefill.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  log("ui.issue_continue", { repo: prefill.repo }, "info", {
                    msg: "Opened pre-filled GitHub issue",
                    src: "ReportIssueModal",
                  })
                }
                className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Continue on GitHub <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-theme-text/60">
              Describe what happened in your own words. That description, plus a compact slice of
              this run&apos;s diagnostic log, is turned into a GitHub issue draft. The last step
              opens it in your browser so you can review it and submit it yourself — nothing is
              posted on your behalf.
            </p>

            <label className="mb-3 block text-xs font-medium text-theme-text/70">
              What happened?
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={2000}
                className="mt-1 w-full rounded border border-theme-border bg-transparent px-2 py-1.5 text-sm text-theme-text focus:border-accent focus:outline-none"
                placeholder="e.g. The camera feed froze during the trial and I had to restart…"
              />
            </label>

            <label className="mb-3 block text-xs font-medium text-theme-text/70">
              Steps to reproduce (optional)
              <textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={3}
                maxLength={1500}
                className="mt-1 w-full rounded border border-theme-border bg-transparent px-2 py-1.5 text-sm text-theme-text focus:border-accent focus:outline-none"
                placeholder="1. Started a new session  2. Ran 3 trials  3. …"
              />
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-theme-text/70">
                How disruptive?
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="mt-1 w-full rounded border border-theme-border bg-panel px-2 py-1.5 text-sm text-theme-text focus:border-accent focus:outline-none"
                >
                  <option value="">Unspecified</option>
                  <option value="minor">Minor — I could continue</option>
                  <option value="moderate">Moderate — I had to work around it</option>
                  <option value="critical">Critical — stopped my work</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-theme-text/70">
                Repository
                <select
                  value={repo}
                  onChange={(e) => setRepo(e.target.value as Repo)}
                  className="mt-1 w-full rounded border border-theme-border bg-panel px-2 py-1.5 text-sm text-theme-text focus:border-accent focus:outline-none"
                >
                  <option value="labrynth">labrynth (this app)</option>
                  <option value="reacher">reacher (backend / firmware)</option>
                </select>
              </label>
            </div>

            {demoMode && (
              <p className="mb-3 text-xs text-theme-text/50">
                Demo mode: no diagnostic log is attached.
              </p>
            )}

            {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={closeReport}
                disabled={busy}
                className="rounded px-3 py-1.5 text-sm text-theme-text hover:bg-accent/10 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handlePrepare}
                disabled={!canSubmit}
                className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Preparing…" : "Continue"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
