import type { FightView, Fighter, View } from '../types'

// M8: a fight belongs to a map. These are the pure parts of the turn strip: when each fighter's Reflex lands, what
// order the strip shows at a given moment, and where each slot of the looping strip sits.

export const fightOn = (view: View | null | undefined, mapId: string | undefined) => (mapId ? view?.fights?.find((f) => f.map === mapId) : undefined)
export const fighterIn = (fight: FightView | undefined, token: string) => fight?.fighters.find((x) => x.token === token)
export const isDown = (x: Fighter) => x.hp <= 0

export const LAND_FIRST = 0.9 // s after the roll before the first number lands
export const LAND_EACH = 0.15 // each next one, in the order the GM picked them
export const SORT_AFTER = 0.5 // after the last lands, the strip sorts itself

/** Server times (s): when each fighter's number lands, and when it takes its place in the order. */
export function landing(f: FightView): { land: Record<string, number>; place: Record<string, number> } {
  const start = f.started ?? 0
  const first = (f.rolled ?? []).filter((t) => f.fighters.some((x) => x.token === t))
  const sortAt = start + LAND_FIRST + first.length * LAND_EACH + SORT_AFTER
  const land: Record<string, number> = {}
  const place: Record<string, number> = {}
  for (const x of f.fighters) {
    const k = first.indexOf(x.token)
    const joined = x.joined ?? start
    if (k >= 0 && joined <= start + 0.01) {
      land[x.token] = start + LAND_FIRST + k * LAND_EACH
      place[x.token] = sortAt
    } else {
      // someone who joined mid-fight rolls on their own, waits at the end of the strip, then slots in
      land[x.token] = joined + LAND_FIRST
      place[x.token] = joined + LAND_FIRST + SORT_AFTER + 0.1
    }
  }
  return { land, place }
}

/** For a screen with sound: the fighters whose dice haven't landed at server time t (s), with when each lands and
 * takes its place. */
export function diceDue(f: FightView, t: number): { token: string; land: number; place: number }[] {
  const { land, place } = landing(f)
  return f.fighters.filter((x) => land[x.token] > t).map((x) => ({ token: x.token, land: land[x.token], place: place[x.token] }))
}

/** The order the strip shows at server time t (s): the GM's pick order while the first dice land, then the turn
 * order, with anyone still rolling in at the end. */
export function shownOrder(f: FightView, t: number): string[] {
  const { place } = landing(f)
  const first = (f.rolled ?? []).filter((x) => f.fighters.some((y) => y.token === x))
  if (first.length && first.some((x) => t < place[x])) return first.concat(f.fighters.map((x) => x.token).filter((x) => !first.includes(x)))
  const settled = f.fighters.map((x) => x.token).filter((x) => t >= place[x])
  return settled.concat(f.fighters.map((x) => x.token).filter((x) => t < place[x]))
}

/** Whose turn is next: the next fighter in order who isn't down. */
export function nextUp(f: FightView): string | null {
  const order = f.fighters
  const i = order.findIndex((x) => x.token === f.now)
  if (i < 0) return null
  for (let k = 1; k < order.length; k++) {
    const x = order[(i + k) % order.length]
    if (!isDown(x)) return x.token
  }
  return null
}

/** Whose turn the board marks at server time t (s). Nobody's while any dice are landing, as on the strip, so the
 * mark never gives away who goes first. */
export function turnNow(f: FightView | undefined, t: number): string | null {
  if (!f?.now) return null
  const { place } = landing(f)
  return f.fighters.some((x) => t < place[x.token]) ? null : f.now
}

export interface Slot {
  i: number // which of the three copies of the order, times n, plus k
  k: number // index into the order
  off: number // slots from the middle
  round: number // the round this copy stands for
  hidden: boolean
}

export const COPIES = 4 // last round, this one, the next, and one more for the slide into the next

/** The looping strip: the order four times over, `pos` slots in (normally in the second copy), so the current fighter
 * sits in the middle and the rounds before and after show at the fading edges. Sliding on into the next round moves
 * `pos` into the third copy, which still has a fourth beyond it, before it jumps back to the same picture. */
export function carousel(n: number, pos: number, round: number, reach = 4): Slot[] {
  const cur = Math.floor(pos / Math.max(1, n))
  const out: Slot[] = []
  for (let i = 0; i < COPIES * n; i++) {
    const c = Math.floor(i / n)
    const r = round + (c - cur)
    const off = i - pos
    out.push({ i, k: i % n, off, round: r, hidden: r < 1 || Math.abs(off) > reach })
  }
  return out
}
