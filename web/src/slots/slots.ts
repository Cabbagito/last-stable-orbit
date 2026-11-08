// The slots' small sums, kept apart from the drawing so they can be tested.

export const COMFORT_PIPS = 8 // one fills with every pull
export const BONUS_SOON_AT = 5 // the bonus it promises from here on never comes

/** How long each reel spins, in seconds. A near miss holds the last reel longer. */
export const spinSeconds = (near: boolean) => [0.9, 1.3, near ? 2.3 : 1.75]

/** Whole seconds left of the stand window, for the plea's pips. It's the shared window, so it may start part gone. */
export function secondsLeft(until: number | null, nowMs: number, window: number): number {
  if (until === null) return 0
  return Math.max(0, Math.min(Math.ceil(window), Math.ceil(until - nowMs / 1000)))
}

export const seatsLabel = (taken: number, seats: number) =>
  taken >= seats ? `ALL ${seats === 4 ? 'FOUR' : seats} SEATS TAKEN` : `${taken} OF ${seats} SEATS TAKEN`

/** A paid-back percentage as the service page writes it: 50 is .5, 110 is 1.1, 1000 is 10. */
export const rateLabel = (pct: number) => String(pct / 100).replace(/^0\./, '.')

export interface Coin {
  dx: number
  dy: number
  d: number // delay, in seconds
  t: number // flight, in seconds
}

/** The canvas's own seeded coins. `spread` is how far out they fly; `rise` is the height they arc from and `extra` its jitter. */
export function coins(n: number, seed: number, spread: number, rise: number, extra: number, delay: number, flight: [number, number]): Coin[] {
  let s = seed
  const r = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  return Array.from({ length: n }, () => ({
    dx: Math.round((r() * 2 - 1) * spread),
    dy: Math.round(rise + r() * extra),
    d: +(r() * delay).toFixed(2), // a negative `delay` starts the loop part way through, so the coins are already flying
    t: +(flight[0] + r() * flight[1]).toFixed(2),
  }))
}
