import { useState, useEffect, useRef } from "react";

interface PresetActionMenuProps {
  onUpdate: () => void;
  onRename: () => void;
  onDelete: () => void;
  canUpdate: boolean;
}

export function PresetActionMenu({ onUpdate, onRename, onDelete, canUpdate }: PresetActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-theme-text/50 hover:text-theme-text transition-colors text-lg leading-none px-1"
        title="Preset actions"
      >
        ...
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-theme-border bg-panel shadow-xl">
          <button
            type="button"
            disabled={!canUpdate}
            onClick={() => { onUpdate(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Update from Session
          </button>
          <button
            type="button"
            onClick={() => { onRename(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-theme-text hover:bg-accent/10 transition"
          >
            Rename
          </button>
          <div className="border-t border-theme-border/40" />
          <button
            type="button"
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
