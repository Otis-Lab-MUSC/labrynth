export function CyberpunkGridBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      {/* Grid layer */}
      <div
        className="absolute inset-0 animate-grid-drift"
        style={{
          backgroundImage: `
            linear-gradient(rgba(var(--color-border), 0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(var(--color-border), 0.4) 1px, transparent 1px)
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
          background: "radial-gradient(ellipse 600px 400px at 50% 40%, rgba(0,229,255,0.05), transparent)",
        }}
      />
    </div>
  );
}
