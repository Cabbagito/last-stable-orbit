import { describe, expect, it } from 'vitest'
import { proj, unproj } from './proj'
import { ring } from './ring'

const BAR: [number, number] = [536, 201]

describe('proj', () => {
  it('matches the Maps board for Dax at the taps', () => {
    // ((11.6 - 1.05) * 30 + 536) * 2, ((11.6 + 1.05) * 15 + 201) * 2
    const [x, y] = proj(BAR, [11.6, 1.05, 0])
    expect(x).toBeCloseTo(1705)
    expect(y).toBeCloseTo(781.5)
  })

  it('round-trips through unproj at the token height', () => {
    for (const at of [[4.203, 2.89, 0.24], [-0.86, 10.35, 0], [12.1, 7.3, 0]] as const) {
      const back = unproj(BAR, proj(BAR, [...at]), at[2])
      expect(back[0]).toBeCloseTo(at[0], 2)
      expect(back[1]).toBeCloseTo(at[1], 2)
      expect(back[2]).toBe(at[2])
    }
  })
})

describe('ring', () => {
  it('lights one HP and one Entropy segment per point', () => {
    const r = ring(4, 2, 216, 12)
    expect(r.arcs).toHaveLength(12)
    expect(r.arcs.filter((a) => a.c === '#5ee08c')).toHaveLength(4)
    expect(r.arcs.filter((a) => a.c === '#f2b544')).toHaveLength(2)
  })
  it("has one health segment per point of the character's own health", () => {
    const ves = ring(3, 6, 216, 12, 4)
    expect(ves.arcs).toHaveLength(4 + 6)
    expect(ves.arcs.filter((a) => a.c === '#5ee08c')).toHaveLength(3)
    expect(ring(9, 0, 64, 9, 9).arcs).toHaveLength(9 + 6)
  })
})
