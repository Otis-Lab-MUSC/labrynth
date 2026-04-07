import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface SavePresetDialogProps {
  open: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SavePresetDialog({ open, onSave, onCancel }: SavePresetDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const canSave = name.trim().length > 0;

  const handleSubmit = () => {
    if (canSave) onSave(name.trim());
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-preset-title"
        className="w-full max-w-sm rounded-lg border border-theme-border bg-panel p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="save-preset-title" className="text-base font-semibold text-theme-text">
          Save as Preset
        </h3>
        <p className="mt-2 text-sm text-theme-text/70">
          Save the current hardware and session configuration as a reusable preset.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Preset name"
          className="input-base mt-3 w-full"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-theme-text hover:bg-accent/10 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover transition disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
