import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface MenuOption<T extends string | number> {
  value: T;
  label: string;
}

interface MenuButtonProps<T extends string | number> {
  value: T;
  options: readonly MenuOption<T>[];
  /** Called with the picked option. Picking applies it at once; there is no separate upload. */
  onSelect: (value: T) => void | Promise<void>;
  disabled?: boolean;
  /** Tooltip and screen-reader label. */
  title?: string;
  /** Stable identity for the diagnostic log (see logging/install.ts). */
  logId?: string;
  className?: string;
}

/**
 * A button showing the current choice that opens a list of options. Picking one applies it
 * straight away (sends or saves it), so it replaces a select plus its upload button.
 */
export function MenuButton<T extends string | number>({
  value, options, onSelect, disabled, title, logId, className = "",
}: MenuButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  const pick = async (next: T) => {
    setOpen(false);
    if (next === value) return;
    setBusy(true);
    try {
      await onSelect(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-log-id={logId}
        data-menu-value={String(value)}
        className={`input-base inline-flex items-center justify-between gap-1 text-left disabled:opacity-50 ${busy ? "animate-pulse" : ""} ${className}`}
      >
        <span className="truncate">{current?.label ?? String(value)}</span>
        <ChevronDown size={14} className="shrink-0 text-theme-text/50" />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 top-full z-30 mt-1 min-w-full max-h-64 overflow-y-auto rounded-lg border border-theme-border bg-panel shadow-xl">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-accent/10 ${o.value === value ? "text-accent" : "text-theme-text"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
