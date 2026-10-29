import { Upload } from "lucide-react";

/** How the button looks: amber when there is something to upload, muted once the board matches. */
export type UploadButtonTone = "pending" | "sent" | "default";

interface UploadIconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /** Tooltip and screen-reader label. */
  title: string;
  tone?: UploadButtonTone;
  /** Pulse the icon while an upload is in flight. */
  sending?: boolean;
}

const TONE_CLASS: Record<UploadButtonTone, string> = {
  pending: "bg-amber-500 text-black ring-2 ring-amber-400/60",
  sent: "bg-theme-text/10 text-theme-text/60",
  default: "bg-accent text-accent-contrast",
};

/** Icon-only button beside a field that uploads that one field to the board. */
export function UploadIconButton({ onClick, disabled, title, tone = "default", sending }: UploadIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-upload-tone={tone}
      className={`btn-sm inline-flex h-6 shrink-0 items-center justify-center px-1.5 py-0 align-middle disabled:opacity-40 ${TONE_CLASS[tone]}`}
    >
      <Upload size={13} className={sending ? "animate-pulse" : undefined} />
    </button>
  );
}
