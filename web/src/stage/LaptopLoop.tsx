import { useEffect, useRef, useState } from 'react'

const FADE = 900 // ms a full-screen picture stays up while it fades away (.app-film's transition)

/** The value, and for a moment after it goes away the last one it had, so what's on screen can fade instead of cut. */
export function useLingering<T>(value: T | null | undefined): T | null {
  const [kept, setKept] = useState(value ?? null)
  useEffect(() => {
    if (value) {
      setKept(value)
      return
    }
    const t = window.setTimeout(() => setKept(null), FADE)
    return () => window.clearTimeout(t)
  }, [value])
  return value ?? kept
}

/** What a player's laptop shows while the TV has the room: the TV's waiting loop, silent. */
export function LaptopLoop({ loop, still }: { loop: string; still: string }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = v.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return // the still, for those who asked for no motion
    el.muted = true // laptops are silent, and browsers only autoplay a muted video
    el.play().catch(() => undefined)
  }, [])
  return <video ref={v} className="app-loop" src={loop} poster={still} loop muted playsInline preload="auto" />
}
