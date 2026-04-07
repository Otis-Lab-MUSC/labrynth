interface TutorialSpotlightProps {
  rect: DOMRect | null;
  visible: boolean;
  interactive?: boolean;
}

export function TutorialSpotlight({ rect, visible, interactive }: TutorialSpotlightProps) {
  if (!visible) return null;

  // Center placement — no cutout, just full dimming
  if (!rect) {
    return (
      <div
        className="fixed inset-0 z-[60] transition-opacity duration-300"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      />
    );
  }

  const padding = 8;

  return (
    <div
      className={`fixed z-[60] transition-all duration-300 ease-out rounded-lg${interactive ? " animate-spotlight-interactive" : ""}`}
      style={{
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
        border: "2px solid rgba(245, 158, 11, 0.5)",
        pointerEvents: "none",
      }}
    />
  );
}
