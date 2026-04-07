import { useEffect } from "react"

const BASE = import.meta.env.BASE_URL

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone()
    }
  }, [onDone])

  return (
    <div
      className="boot-overlay"
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onDone()
      }}
    >
      <img
        src={`${BASE}favicon.svg`}
        alt=""
        className="boot-logo"
        draggable={false}
      />
    </div>
  )
}
