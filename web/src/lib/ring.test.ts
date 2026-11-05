import { describe, expect, it } from 'vitest'
import { hpRing, ring } from './ring'

// the sweep of an SVG arc path "M x y A r r 0 large 1 x y": its large-arc flag says whether it's over half the ring
const large = (d: string) => d.split(' ')[4] === '1'

describe('health slices', () => {
  it('fill the whole ring, even at 1 health, with one clean break', () => {
    const one = hpRing(1, 1, '#7fb4ff', 64, 5)
    expect(one.arcs).toHaveLength(1)
    expect(large(one.arcs[0].d)).toBe(true) // 353 degrees, not a short slice
    expect(one.arcs[0].c).toBe('#7fb4ff')
  })
  it('split into halves and thirds, lit from the top', () => {
    const two = hpRing(1, 2, '#c9bcff', 64, 5)
    expect(two.arcs.map((a) => a.c)).toEqual(['#c9bcff', '#2a2a31'])
    expect(hpRing(3, 3, '#ff5a4a', 64, 5).arcs.every((a) => !large(a.d))).toBe(true)
  })
  it("match the crew's slices", () => {
    expect(hpRing(4, 4, '#5ee08c', 64, 9).arcs.map((a) => a.d)).toEqual(ring(4, 0, 64, 9, 4).arcs.slice(0, 4).map((a) => a.d))
  })
})
