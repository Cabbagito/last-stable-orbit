import { describe, expect, it } from 'vitest'
import type { RollView } from '../types'
import { LEAVE, OUT, REPUSH, foldPlates, livePlates, type PlateMemo } from './banners'

const roll = (o: Partial<RollView> = {}): RollView => ({
  id: 'r1', by: 'ves', char: 'ves', token: 'ves', stat: 'tech', sides: 10, phase: 'roll', open: true, pushes: 0, pushed: 0, failed: false, sealed: false, god: false, started: 0, ...o,
})
const fold = (memo: PlateMemo, r: RollView, now: number, seat = 'marlo', first = false) => foldPlates(memo, [r], now, seat, first).memo
const at = (memo: PlateMemo, r: RollView, now: number, gm = false) => livePlates([r], memo, now, gm)[0]?.phase

describe('roll banners', () => {
  it('come in with the dice and leave 4 s after they land, whenever the roller closes', () => {
    let m = fold({}, roll(), 0)
    expect(at(m, roll(), 100)).toBe('roll')
    const boom = roll({ phase: 'boom' })
    m = fold(m, boom, 1000)
    expect(at(m, boom, 1000)).toBe('boom')
    const land = roll({ phase: 'land', value: 12 })
    const { memo, wake } = foldPlates(m, [land], 2000, 'marlo', false)
    expect(wake).toEqual([LEAVE, LEAVE + OUT])
    expect(at(memo, land, 2000 + LEAVE - 1)).toBe('land')
    const closed = { ...land, open: false }
    expect(at(fold(memo, closed, 2500), closed, 2000 + LEAVE - 1)).toBe('land')
    expect(at(memo, land, 2000 + LEAVE)).toBe('out')
    expect(at(memo, land, 2000 + LEAVE + OUT)).toBeUndefined()
  })

  it('keep a natural 1 and a sealed roll as they are', () => {
    for (const phase of ['nat1', 'seal'] as const) {
      const r = roll({ phase })
      const m = fold(fold({}, roll(), 0), r, 1000)
      expect(at(m, r, 1100)).toBe(phase)
    }
  })

  it('pop back for a push after they have left, and hold on for one before', () => {
    const land = roll({ phase: 'land', value: 12 })
    let m = fold(fold({}, roll(), 0), land, 1000)
    const pushed = roll({ phase: 'push', value: 13, pushes: 1, pushed: 1 })
    const early = fold(m, pushed, 4900)
    expect(at(early, pushed, 4900)).toBe('push')
    expect(at(early, pushed, 4900 + REPUSH - 1)).toBe('push') // held on past the first 4 s
    m = fold(m, land, 7000)
    expect(at(m, land, 7000)).toBeUndefined()
    const late = fold(m, pushed, 7400)
    expect(at(late, pushed, 7400)).toBe('repush')
    expect(at(late, pushed, 7400 + REPUSH)).toBe('out')
  })

  it("don't replay what landed before this screen connected, and pick up what's still in the air", () => {
    const land = roll({ phase: 'land', value: 12 })
    expect(at(fold({}, land, 1000, 'marlo', true), land, 1000)).toBeUndefined()
    expect(at(fold({}, roll(), 1000, 'marlo', true), roll(), 1000)).toBe('roll')
    const over = { ...land, open: false }
    expect(fold({}, over, 1000)).toEqual({})
  })

  it('never show your own roll, but show the GM their own, quietly', () => {
    expect(fold({}, roll(), 0, 'ves')).toEqual({})
    const mine = roll({ by: 'gm', char: null, token: 'dax', tag: 'SECRET' })
    const m = fold({}, mine, 0, 'gm')
    expect(livePlates([mine], m, 0, true)[0].quiet).toBe(true)
    const crew = roll()
    expect(livePlates([crew], fold({}, crew, 0, 'gm'), 0, true)[0].quiet).toBe(false)
  })

  it("leave a God roll to its own screen, except on the GM's", () => {
    const god = roll({ by: 'gm', char: null, token: null, god: true })
    const m = fold({}, god, 0)
    expect(livePlates([god], m, 0, false)).toEqual([])
    expect(livePlates([god], m, 0, true)).toHaveLength(1)
  })

  it("show each roller's newest, and three at most", () => {
    const rolls = ['a', 'b', 'c', 'd'].map((c, i) => roll({ id: `r${i}`, char: c, token: c, by: c }))
    const again = roll({ id: 'r9', char: 'a', token: 'a', by: 'a' })
    const m = foldPlates({}, [...rolls, again], 0, 'marlo', false).memo
    expect(livePlates([...rolls, again], m, 0, false).map((p) => p.r.id)).toEqual(['r2', 'r3', 'r9'])
  })
})
