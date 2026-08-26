export function CyberpunkGridBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      {/* Grid layer */}
      <div
        className="absolute inset-0 animate-grid-drift"
        style={{
          backgroundImage: `
            linear-gradient(color-mix(in srgb, var(--border-hairline) 40%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--border-hairline) 40%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
      {/* Glow layer */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 600px 400px at 50% 40%, color-mix(in srgb, var(--accent) 5%, transparent), transparent)",
        }}
      />
    </div>
  );
}
