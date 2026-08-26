import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, X } from "lucide-react";
import { getLocalClient } from "../../api/client";
import { DemoMachineApiClient } from "../../api/demoClient";
import { flush, log } from "../../logging";
import { useReportStore } from "../../store/useReportStore";
import { useSessionStore } from "../../store/useSessionStore";
import { LOCAL_PLACEHOLDER_ID, useMachineStore } from "../../store/useMachineStore";
import { useTutorialStore } from "../../store/useTutorialStore";

type Severity = "" | "minor" | "moderate" | "critical";
type Repo = "labrynth" | "reacher";

interface IssueStatus {
  llm: boolean;
  github: boolean;
  owner: string;
  repos: string[];
}

interface ReportResult {
  title: string;
  body: string;
  labels: string[];
  summarized: boolean;
  filed: boolean;
  html_url: string | null;
  repo: string;
}

export function ReportIssueModal() {
  const open = useReportStore((s) => s.open);
  const prefill = useReportStore((s) => s.prefill);
  const closeReport = useReportStore((s) => s.closeReport);

  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [severity, setSeverity] = useState<Severity>("");
  const [repo, setRepo] = useState<Repo>("labrynth");
  const [status, setStatus] = useState<IssueStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const demoMode = useTutorialStore((s) => s.demoMode);

  function apiClient() {
    if (useTutorialStore.getState().demoMode) {
      return useMachineStore.getState().getClient(LOCAL_PLACEHOLDER_ID) ?? new DemoMachineApiClient();
    }
    return useMachineStore.getState().getClient(LOCAL_PLACEHOLDER_ID) ?? getLocalClient();
  }

  const sessionRunning = useSessionStore((s) =>
    [...s.sessions.values()].some((sess) => sess.state === "running"),
  );

  useEffect(() => {
    if (!open) return;
    setDescription(prefill);
    setSteps("");
    setSeverity("");
    setRepo("labrynth");
    setError(null);
    setResult(null);
    setCopied(false);
    closeRef.current?.focus();
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    apiClient()
      .getIssueStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({ llm: false, github: false, owner: "Otis-Lab-MUSC", repos: ["labrynth", "reacher"] }),
      );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeReport();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, closeReport]);

  if (!open) return null;

  const llmReady = Boolean(status?.llm);
  const githubReady = Boolean(status?.github) && !demoMode;
  const canSubmit = description.trim().length > 0 && llmReady && !busy;

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    setResult(null);
    log("ui.issue_report", { repo, severity, demoMode }, "info", {
      msg: "Issue report submitted",
      src: "ReportIssueModal",
    });
    try {
      await flush();
      const data = await apiClient().reportIssue({
        description: description.trim(),
        steps: steps.trim(),
        severity,
        repo,
        app_version: __APP_VERSION__,
        file: githubReady,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    const text = `# ${result.title}\n\n${result.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const submitLabel = busy
    ? "Working…"
    : githubReady
      ? "Submit to GitHub"
      : "Summarize";

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
            Report an issue
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

        {result ? (
          <div className="space-y-3">
            {result.filed && result.html_url ? (
              <p className="text-sm text-theme-text/80">
                Filed{" "}
                <a
                  href={result.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  {result.title} <ExternalLink size={12} />
                </a>
              </p>
            ) : (
              <p className="text-sm text-theme-text/80">
                {result.summarized
                  ? "Summary ready. GitHub filing is not configured on this machine — copy the markdown below."
                  : "The local model could not summarize this report. A fallback draft is below."}
              </p>
            )}
            <pre className="max-h-64 overflow-auto rounded border border-theme-border bg-black/20 p-3 text-xs text-theme-text/80 whitespace-pre-wrap">
              {`# ${result.title}\n\n${result.body}`}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded border border-theme-border px-3 py-1.5 text-xs text-theme-text/70 transition hover:border-accent hover:text-accent"
              >
                <Copy size={11} />
                {copied ? "Copied" : "Copy markdown"}
              </button>
              <button
                onClick={closeReport}
                className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-theme-text/60">
              Describe what happened in your own words. A local model on this machine will turn
              that description plus a compact slice of this run&apos;s diagnostic log into a
              technical GitHub issue. No cloud AI key is required.
            </p>
            <p className="mb-4 text-xs text-amber-500/90">
              The log excerpt can include experiment identifiers (subject IDs, doses, file paths).
              Only submit if you are comfortable sending that excerpt to GitHub.
            </p>

            <label className="mb-3 block text-xs font-medium text-theme-text/70">
              What happened?
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
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

            {sessionRunning && (
              <p className="mb-3 text-xs text-amber-500/90">
                A session is running. Summarization uses a small amount of CPU and may take up to
                two minutes.
              </p>
            )}

            {demoMode && (
              <p className="mb-3 text-xs text-theme-text/50">
                Demo mode: nothing will be filed on GitHub.
              </p>
            )}

            {status && !status.llm && (
              <p className="mb-3 text-xs text-red-500">
                The local summarizer is not available on this build. Issue reporting needs the
                bundled llama.cpp model.
              </p>
            )}

            {status && status.llm && !githubReady && !demoMode && (
              <p className="mb-3 text-xs text-theme-text/50">
                GitHub filing is not configured (no REACHER_GITHUB_TOKEN). You can still summarize
                and copy the markdown.
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
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-40"
              >
                {submitLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
