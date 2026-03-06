import { useEffect, useRef, useState } from "react";

export function CyberpunkCursor() {
  const diamondRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      if (diamondRef.current) {
        diamondRef.current.style.left = `${x}px`;
        diamondRef.current.style.top = `${y}px`;
      }
      if (dotRef.current) {
        dotRef.current.style.left = `${x}px`;
        dotRef.current.style.top = `${y}px`;
      }
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("a, button, [role='button']")) {
        setHovering(true);
      }
    };

    const onOut = (e: MouseEvent) => {
      const target = e.relatedTarget as HTMLElement | null;
      if (!target || !target.closest("a, button, [role='button']")) {
        setHovering(false);
      }
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  const size = hovering ? 28 : 16;
  const opacity = hovering ? 0.6 : 1;

  return (
    <>
      <div
        ref={diamondRef}
        className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ease-out"
        style={{
          width: size,
          height: size,
          border: "1.5px solid rgb(var(--color-accent))",
          transform: `translate(-50%, -50%) rotate(45deg)`,
          opacity,
          zIndex: 10000,
        }}
      />
      <div
        ref={dotRef}
        className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          backgroundColor: "rgb(var(--color-accent))",
          boxShadow: "0 0 6px rgb(var(--color-accent)), 0 0 12px rgb(var(--color-accent) / 0.4)",
          zIndex: 10001,
        }}
      />
    </>
  );
}
