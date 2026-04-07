import { useState, useEffect, useRef, useCallback } from "react";

export function useContainerWidth(): [React.RefCallback<HTMLElement>, number] {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    elementRef.current = node;

    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          setWidth(cr.width);
        }
      });
      observer.observe(node);
      observerRef.current = observer;

      // Set initial width
      setWidth(node.clientWidth);
    }
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return [ref, width];
}
