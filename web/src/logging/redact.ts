/**
 * Client-side redaction.
 *
 * Field values are logged verbatim by design — subject IDs, doses, durations
 * and paths are exactly what make a bug reproducible. Credentials are the only
 * exception. The server re-applies this on ingest, so this pass is defence in
 * depth rather than the guarantee.
 */

export const REDACTED = "[redacted]";

/**
 * Secret-ness is tested against a *normalised* string (lowercased, with spaces,
 * hyphens and underscores removed) so that "Pairing Code", "pairing_code" and
 * "pairingCode" all match the same rule.
 */
const SECRET_TERMS = [
  "apikey",
  "secret",
  "password",
  "passwd",
  "token",
  "bearer",
  "authorization",
  "credential",
  "pairingcode",
  "privatekey",
];

function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

const MAX_STR = 2048;
const MAX_SEQ = 100;
const MAX_DEPTH = 6;

export function isSecretKey(key: string): boolean {
  const n = normalise(key);
  return SECRET_TERMS.some((t) => n.includes(t));
}

/**
 * Decide whether a form control holds a secret.
 *
 * A DOM value is always logged under the generic key `value`, so the key-based
 * denylist can never fire for it. Identity has to come from the control's own
 * attributes and its visible label instead — the pairing-code input, for
 * example, has no name or id and is identified only by a sibling <label>.
 */
export function isSecretField(el: Element): boolean {
  const parts: string[] = [];
  for (const attr of ["name", "id", "data-log-id", "placeholder", "aria-label", "autocomplete"]) {
    const v = el.getAttribute(attr);
    if (v) parts.push(v);
  }
  const id = el.getAttribute("id");
  if (id) {
    const bound = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (bound?.textContent) parts.push(bound.textContent);
  }
  // Unassociated sibling label, the common pattern in this codebase.
  const container = el.closest("div");
  const sibling = container?.querySelector("label");
  if (sibling?.textContent) parts.push(sibling.textContent);

  return isSecretKey(parts.join(" "));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[max-depth]";
  if (value === null || value === undefined) return value ?? null;

  const t = typeof value;
  if (t === "boolean" || t === "number") {
    return Number.isFinite(value as number) || t === "boolean" ? value : String(value);
  }
  if (t === "string") {
    const s = value as string;
    return s.length <= MAX_STR ? s : `${s.slice(0, MAX_STR)}…[+${s.length - MAX_STR}]`;
  }
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_SEQ).map((v) => redact(v, depth + 1));
    if (value.length > MAX_SEQ) out.push(`[+${value.length - MAX_SEQ} more]`);
    return out;
  }
  if (t === "object") {
    // Elements and events are unbounded object graphs; summarise instead.
    if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack?.slice(0, MAX_STR) };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  try {
    return String(value).slice(0, MAX_STR);
  } catch {
    return "[unrepresentable]";
  }
}
