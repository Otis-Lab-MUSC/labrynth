import type { ReactNode } from "react";

interface Props {
  /** True while the session is armed and waiting for an external trigger. */
  locked: boolean;
  children: ReactNode;
}

/**
 * Disables a panel's controls while the session is armed.
 *
 * Configuration is applied one command per HTTP request, not as a transaction,
 * so a trigger edge landing partway through an edit would start the run on a
 * half-applied config. The backend refuses device commands with 409 while armed;
 * this stops the controls looking live and failing. A native `fieldset[disabled]`
 * disables every form control inside it, so no per-control wiring is needed.
 *
 * Caveat: a dialog rendered with `createPortal` becomes a DOM *sibling* of the
 * fieldset, not a descendant, so `disabled` does not reach it. The preset save,
 * confirm, and update dialogs are portalled; they are safe today only because
 * their handlers touch the local store rather than the backend. Any portalled
 * control that issues a device command needs its own `armed` check — this
 * component cannot cover it.
 */
export function ConfigLock({ locked, children }: Props) {
  return (
    <>
      {locked && (
        <p
          role="status"
          className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-mono text-amber-400"
        >
          Armed and waiting for the external trigger — settings are locked. Cancel
          the arm in the monitor to change them.
        </p>
      )}
      <fieldset
        disabled={locked}
        className={`m-0 min-w-0 border-0 p-0 ${locked ? "opacity-50" : ""}`}
      >
        {children}
      </fieldset>
    </>
  );
}
