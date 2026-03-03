import { useState, useEffect, useCallback } from "react";

const MAX_RETRIES = 10;
const RETRY_DELAY = 50;

export function useMeasureElement(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [selector]);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    // Initial measure after a frame
    const raf = requestAnimationFrame(measure);

    const el = document.querySelector(selector);
    if (el) {
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(measure);
      });
      observer.observe(el);

      const handleReflow = () => requestAnimationFrame(measure);
      window.addEventListener("resize", handleReflow);
      window.addEventListener("scroll", handleReflow, true);

      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        window.removeEventListener("resize", handleReflow);
        window.removeEventListener("scroll", handleReflow, true);
      };
    }

    // Element not found yet — retry with short delays (handles panel navigation)
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    const retryFind = () => {
      const found = document.querySelector(selector);
      if (found) {
        setRect(found.getBoundingClientRect());
      } else if (retries < MAX_RETRIES) {
        retries++;
        retryTimer = setTimeout(retryFind, RETRY_DELAY);
      }
    };
    retryTimer = setTimeout(retryFind, RETRY_DELAY);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(retryTimer);
    };
  }, [selector, measure]);

  return rect;
}
