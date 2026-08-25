/**
 * Global capture of user interaction and failure.
 *
 * Capture-phase listeners on `document` rather than per-handler instrumentation:
 * the app has ~150 onClick and ~60 onChange sites and no shared input
 * primitives, so editing call sites would be both invasive and impossible to
 * keep current. One listener per event type sees everything, including controls
 * added later.
 *
 * Add `data-log-id` to a control to give it a stable identity in the log; the
 * DOM fallback keeps unlabelled controls legible in the meantime.
 */

import { log, flush, startLogger } from "./logger";
import { isSecretField, REDACTED } from "./redact";

const MAX_LABEL = 64;
const INPUT_DEBOUNCE_MS = 400;

let installed = false;

function labelFor(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.slice(0, MAX_LABEL);
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);
}

/** Walk up to the nearest thing a person would say they clicked. */
function actionable(target: EventTarget | null): Element | null {
  let el = target instanceof Element ? target : null;
  for (let i = 0; el && i < 8; i++) {
    if (
      el.hasAttribute("data-log-id") ||
      el.tagName === "BUTTON" ||
      el.tagName === "A" ||
      el.getAttribute("role") === "button" ||
      el.tagName === "SELECT"
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function describe(el: Element): Record<string, unknown> {
  const out: Record<string, unknown> = { tag: el.tagName.toLowerCase() };
  const id = el.getAttribute("data-log-id");
  if (id) out.logId = id;
  if (el.id) out.id = el.id;
  const name = el.getAttribute("name");
  if (name) out.name = name;
  const label = labelFor(el);
  if (label) out.label = label;
  if ((el as HTMLButtonElement).disabled) out.disabled = true;
  const panel = el.closest("[data-panel]")?.getAttribute("data-panel");
  if (panel) out.panel = panel;
  return out;
}

/**
 * Field values are captured verbatim (the project's explicit choice), except
 * password inputs, which are never read at all.
 */
function valueOf(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): unknown {
  // A DOM value lands under the generic key `value`, so the key denylist cannot
  // protect it — the field's own identity has to be consulted instead.
  if (isSecretField(el)) return REDACTED;
  if (el instanceof HTMLInputElement) {
    if (el.type === "password") return REDACTED;
    if (el.type === "checkbox" || el.type === "radio") return el.checked;
    if (el.type === "file") return `[${el.files?.length ?? 0} file(s)]`;
  }
  return el.value;
}

export function installGlobalCapture(): void {
  if (installed) return;
  installed = true;

  startLogger();

  document.addEventListener(
    "click",
    (ev) => {
      const el = actionable(ev.target);
      if (!el) return;
      log("ui.click", describe(el), "info", { msg: labelFor(el) || undefined, src: "ui" });
    },
    true
  );

  // `change` is the committed value; `input` is debounced so typing does not
  // produce one record per keystroke.
  document.addEventListener(
    "change",
    (ev) => {
      const el = ev.target;
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLSelectElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      log("ui.change", { ...describe(el), type: (el as HTMLInputElement).type, value: valueOf(el) }, "info", {
        src: "ui",
      });
    },
    true
  );

  const pending = new Map<Element, ReturnType<typeof setTimeout>>();
  document.addEventListener(
    "input",
    (ev) => {
      const el = ev.target;
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      const existing = pending.get(el);
      if (existing) clearTimeout(existing);
      pending.set(
        el,
        setTimeout(() => {
          pending.delete(el);
          log("ui.input", { ...describe(el), type: (el as HTMLInputElement).type, value: valueOf(el) }, "debug", {
            src: "ui",
          });
        }, INPUT_DEBOUNCE_MS)
      );
    },
    true
  );

  // Deliberately not a keylogger: only keys that mean something on their own.
  // `change`/`input` already carry the actual typed values.
  document.addEventListener(
    "keydown",
    (ev) => {
      const interesting =
        ev.key === "Enter" || ev.key === "Escape" || ev.ctrlKey || ev.metaKey;
      if (!interesting) return;
      const el = ev.target instanceof Element ? describe(ev.target) : {};
      log(
        "ui.key",
        { ...el, key: ev.key, ctrl: ev.ctrlKey, meta: ev.metaKey, shift: ev.shiftKey },
        "debug",
        { src: "ui" }
      );
    },
    true
  );

  window.addEventListener("error", (ev) => {
    log(
      "ui.error",
      {
        message: ev.message,
        source: ev.filename,
        line: ev.lineno,
        column: ev.colno,
        stack: ev.error?.stack,
      },
      "error",
      { msg: ev.message, src: "window.onerror" }
    );
    void flush();
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    log(
      "ui.unhandled_rejection",
      { reason: reason instanceof Error ? reason.stack : String(reason) },
      "error",
      { msg: reason instanceof Error ? reason.message : String(reason), src: "unhandledrejection" }
    );
    void flush();
  });

  document.addEventListener("visibilitychange", () => {
    log("ui.visibility", { state: document.visibilityState }, "debug", { src: "ui" });
    if (document.visibilityState === "hidden") void flush(true);
  });

  window.addEventListener("pagehide", () => {
    log("app.unload", undefined, "info", { msg: "Page unloading", src: "ui" });
    void flush(true);
  });

  window.addEventListener("online", () => log("net.online", undefined, "info", { src: "ui" }));
  window.addEventListener("offline", () => log("net.offline", undefined, "warn", { src: "ui" }));

  patchConsole();
}

/**
 * Mirror console.error/warn into the log. The logger's own reentrancy guard
 * keeps a failure inside logging from recursing back through here.
 */
function patchConsole(): void {
  (["error", "warn"] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        log(
          `console.${level}`,
          { args: args.map((a) => (a instanceof Error ? a.stack : a)) },
          level === "error" ? "error" : "warn",
          { msg: args.map((a) => (typeof a === "string" ? a : "")).join(" ").trim() || undefined, src: "console" }
        );
      } catch {
        /* ignore */
      }
      original(...args);
    };
  });
}

/** Record what this build and browser actually are. */
export function logBoot(): void {
  log(
    "app.boot",
    {
      version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: { w: window.screen?.width, h: window.screen?.height, dpr: window.devicePixelRatio },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      url: location.href,
    },
    "info",
    { msg: "Labrynth UI started", src: "main" }
  );
}
