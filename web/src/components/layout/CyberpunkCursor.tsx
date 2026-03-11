import { useEffect, useRef } from "react";

export function CyberpunkCursor() {
  const diamondRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -9999, y: -9999 });
  const hoverRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const applyStyles = () => {
      rafRef.current = null;
      const { x, y } = posRef.current;
      const hovering = hoverRef.current;
      const size = hovering ? 28 : 16;
      const opacity = hovering ? 0.6 : 1;
      if (diamondRef.current) {
        const el = diamondRef.current;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(45deg)`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.opacity = String(opacity);
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    };

    const scheduleUpdate = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(applyStyles);
    };

    const onMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      scheduleUpdate();
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button, [role='button']")) {
        hoverRef.current = true;
        scheduleUpdate();
      }
    };

    const onOut = (e: MouseEvent) => {
      const target = e.relatedTarget as HTMLElement | null;
      if (!target || !target.closest("a, button, [role='button']")) {
        hoverRef.current = false;
        scheduleUpdate();
      }
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={diamondRef}
        className="pointer-events-none fixed"
        style={{
          width: 16,
          height: 16,
          border: "1.5px solid rgb(var(--color-accent))",
          transform: "translate(-9999px, -9999px) rotate(45deg)",
          transition: "width 150ms ease-out, height 150ms ease-out, opacity 150ms ease-out",
          zIndex: 10000,
          willChange: "transform",
        }}
      />
      <div
        ref={dotRef}
        className="pointer-events-none fixed"
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          backgroundColor: "rgb(var(--color-accent))",
          boxShadow: "0 0 6px rgb(var(--color-accent)), 0 0 12px rgb(var(--color-accent) / 0.4)",
          transform: "translate(-9999px, -9999px)",
          zIndex: 10001,
          willChange: "transform",
        }}
      />
    </>
  );
}
