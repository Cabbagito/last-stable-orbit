import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Arriving somewhere (the UI review canvas, "Round 1: small motion", board "Location change"). When the party's map
 * changes, the old one fades to black over OUT ms and only then is swapped; the new place's name comes up large on
 * the black, the map fades back in under it, and the name settles into its usual corner, IN ms after the swap.
 * Nothing happens on the first map you see, or for anyone with reduced motion on. The styles are in app.css (arr-).
 */
const OUT = 400
const IN = 2400

export type ArrivalPhase = 'out' | 'in' | null

const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The map to draw, which trails `target` by the fade out, and where the change is in its course. */
export function useArrival(target: string): { shown: string; phase: ArrivalPhase } {
  const [shown, setShown] = useState(target)
  const [phase, setPhase] = useState<ArrivalPhase>(null)
  useEffect(() => {
    if (target === shown) return
    if (!shown || !target || still()) {
      setShown(target)
      setPhase(null)
      return
    }
    setPhase('out')
    const t = window.setTimeout(() => {
      setShown(target)
      setPhase('in')
    }, OUT)
    return () => window.clearTimeout(t)
  }, [target, shown])
  useEffect(() => {
    if (phase !== 'in') return
    const t = window.setTimeout(() => setPhase(null), IN)
    return () => window.clearTimeout(t)
  }, [phase, shown])
  return { shown: shown || target, phase }
}

/** The black between two maps. It sits over the map and under the place name. */
export function ArrivalShade({ phase }: { phase: ArrivalPhase }) {
  return phase ? <div className={'arr-shade arr-' + phase} aria-hidden="true" /> : null
}

/**
 * For the place name's wrapper: while arriving it starts large in the middle of the nearest `.arr-box` and ends where
 * it always sits. Works out how far that is, in the wrapper's own pixels (the TV's label is scaled).
 */
export function useArrivalLabel(phase: ArrivalPhase, shown: string) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.closest('.arr-box')
    if (phase !== 'in' || !el || !box) return
    for (const v of ['--arr-dx', '--arr-dy', '--arr-s']) el.style.removeProperty(v) // measure it where it rests
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    if (!r.width || !b.width) return
    const k = r.width / el.offsetWidth || 1
    const s = Math.min(2, (0.86 * b.width) / r.width)
    el.style.setProperty('--arr-dx', `${((b.width - s * r.width) / 2 - (r.left - b.left)) / k}px`)
    el.style.setProperty('--arr-dy', `${((b.height - s * r.height) / 2 - (r.top - b.top)) / k}px`)
    el.style.setProperty('--arr-s', String(s))
  }, [phase, shown])
  return ref
}
