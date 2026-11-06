import type { BurnView } from '../types'

// The Burn mark: what every laptop shows on the burner's token and crew-rail ring while a Burn plays on the TV.
// It shows from the moment the Burn goes off until its film ends, then stays
// LINGER more and fades over FADE, the way a roll's callout does.
export const BURN_LINGER = 4000
export const BURN_FADE = 700

export type BurnPhase = 'on' | 'after'

/** Where the newest Burn this screen saw is at `now` (server ms), or null once its mark has gone. */
export function burnPhase(b: BurnView | null, now: number): { phase: BurnPhase; fading: boolean } | null {
  if (!b) return null
  const end = b.ends * 1000
  if (now < end) return { phase: 'on', fading: false }
  const age = now - end
  if (age < BURN_LINGER) return { phase: 'after', fading: false }
  if (age < BURN_LINGER + BURN_FADE) return { phase: 'after', fading: true }
  return null
}

/** The moments (ms from `now`) a screen must redraw for the mark: the film's end, the fade, and the end of it. */
export function burnTicks(b: BurnView, now: number): number[] {
  const left = b.ends * 1000 - now
  return [left, left + BURN_LINGER, left + BURN_LINGER + BURN_FADE].filter((d) => d >= 0)
}
