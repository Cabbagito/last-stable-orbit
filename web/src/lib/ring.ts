// The HP / Entropy ring from R6 ("segments", the chosen style). Both count down: more lit is better.
// A ring is a list of SVG arcs in a 100 x 100 box, plus where the portrait sits inside it.

export interface Arc {
  d: string
  c: string
  w: number
  cap: 'butt' | 'round'
  o: number
}
export interface Ring {
  arcs: Arc[]
  p: number // portrait inset, % of the box
  d: number // portrait diameter, % of the box
}

export const HP_COLOR = '#5ee08c'
export const ENTROPY_COLOR = '#f2b544'
const UNLIT = '#2a2a31'

const f2 = (n: number) => Math.round(n * 100) / 100
const pt = (r: number, a: number): [number, number] => {
  const t = (a * Math.PI) / 180
  return [50 + r * Math.sin(t), 50 - r * Math.cos(t)]
}
const P = (p: [number, number]) => `${f2(p[0])} ${f2(p[1])}`

function arcPath(r: number, a0: number, a1: number): string {
  const seg = (x: number, y: number) => `A${f2(r)} ${f2(r)} 0 ${y - x > 180 ? 1 : 0} 1 ${P(pt(r, y))}`
  return a1 - a0 >= 359.9
    ? `M${P(pt(r, a0))}${seg(a0, a0 + 180)}${seg(a0 + 180, a0 + 360)}`
    : `M${P(pt(r, a0))}${seg(a0, a1)}`
}

/** Crew ring: one HP segment per health point outside, six Entropy segments inside. px = rendered size, band = ring width in px. */
export function ring(hp: number, entropy: number, px: number, band: number, health = 6): Ring {
  const u = 100 / px
  const big = px > 100
  const t1 = big ? 5 : 3
  const t2 = big ? 3 : 2
  const r1 = 50 - (t1 / 2) * u
  const r2 = r1 - (t1 / 2 + (big ? 3 : 2) + t2 / 2) * u
  const arcs: Arc[] = []
  // one health segment per point (Ves has 4, Tomo 9), as the Burn row board draws it; Entropy always holds 6
  const a = 360 / Math.max(1, health)
  for (let i = 0; i < health; i++) {
    arcs.push({ d: arcPath(r1, i * a + 3.5, (i + 1) * a - 3.5), c: i < hp ? HP_COLOR : UNLIT, w: f2(t1 * u), cap: 'butt', o: 1 })
  }
  for (let i = 0; i < 6; i++) {
    arcs.push({ d: arcPath(r2, i * 60 + 3.5, i * 60 + 56.5), c: i < entropy ? ENTROPY_COLOR : UNLIT, w: f2(t2 * u), cap: 'butt', o: 1 })
  }
  const p = (band / px) * 100
  return { arcs, p: f2(p), d: f2(100 - 2 * p) }
}

/** NPC ring: one plain circle in the faction colour. */
export function plainRing(color: string, px: number, band: number): Ring {
  const u = 100 / px
  const r = 50 - 0.75 * u
  const d = `M50 ${50 - r}A${r} ${r} 0 1 1 50 ${50 + r}A${r} ${r} 0 1 1 50 ${50 - r}`
  const p = (band / px) * 100
  return { arcs: [{ d, c: color, w: 1.5 * u, cap: 'butt', o: 1 }], p, d: 100 - 2 * p }
}

/**
 * An NPC in a fight (M8): its health, in its faction's colour, outside only. Like the crew's, one slice per point
 * filling the whole ring with clean breaks, so 1 health is the whole ring with one break at the top.
 */
export function hpRing(hp: number, health: number, color: string, px: number, band: number): Ring {
  const u = 100 / px
  const t1 = px > 100 ? 5 : 3
  const r1 = 50 - (t1 / 2) * u
  const a = 360 / Math.max(1, health)
  const arcs: Arc[] = []
  for (let i = 0; i < health; i++) {
    arcs.push({ d: arcPath(r1, i * a + 3.5, (i + 1) * a - 3.5), c: i < hp ? color : UNLIT, w: f2(t1 * u), cap: 'butt', o: 1 })
  }
  const p = (band / px) * 100
  return { arcs, p: f2(p), d: f2(100 - 2 * p) }
}
