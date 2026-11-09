import { describe, expect, it } from 'vitest'
import type { FightView, Fighter } from '../types'
import { carousel, diceDue, landing, nextUp, shownOrder, turnNow } from './fights'

const x = (token: string, hp = 3, joined = 100): Fighter => ({ token, kind: 'npc', ref: token, name: token, portrait: '', color: '', hp, health: 4, ini: 5, joined })
const fight = (over: Partial<FightView> = {}): FightView => ({
  map: 'eh', name: 'EH', round: 1, now: 'gun', started: 100, rolled: ['tomo', 'gun', 'lale'],
  fighters: [x('gun'), x('tomo'), x('lale')], ...over,
})

describe('the turn mark on the board', () => {
  it('waits for every die, so it never gives away who goes first', () => {
    const f = fight()
    expect(turnNow(f, 100.5)).toBeNull()
    expect(turnNow(f, 200)).toBe('gun')
  })
  it('steps aside while someone who joined late rolls', () => {
    const f = fight({ fighters: [x('gun'), x('tomo'), x('lale'), x('late', 3, 150)] })
    expect(turnNow(f, 150.5)).toBeNull()
    expect(turnNow(f, 200)).toBe('gun')
  })
  it('marks nobody with no fight, or when the turn is hidden from this viewer', () => {
    expect(turnNow(undefined, 200)).toBeNull()
    expect(turnNow(fight({ now: null }), 200)).toBeNull()
  })
})

describe('the dice landing', () => {
  it('land one by one in the pick order, then the strip sorts', () => {
    const { land, place } = landing(fight())
    ;[100.9, 101.05, 101.2].forEach((want, i) => expect([land.tomo, land.gun, land.lale][i]).toBeCloseTo(want))
    expect(place.gun).toBeCloseTo(101.85)
    expect(shownOrder(fight(), 101)).toEqual(['tomo', 'gun', 'lale'])
    expect(shownOrder(fight(), 102)).toEqual(['gun', 'tomo', 'lale'])
  })
  it('lets someone who joins later roll at the end, then slot in', () => {
    const f = fight({ fighters: [x('gun'), x('fixer', 10, 200), x('tomo'), x('lale')] })
    expect(shownOrder(f, 200.5)).toEqual(['gun', 'tomo', 'lale', 'fixer'])
    expect(shownOrder(f, 202)).toEqual(['gun', 'fixer', 'tomo', 'lale'])
  })
})

describe('the dice still to land', () => {
  it('are everyone at the start, then fewer, then none', () => {
    expect(diceDue(fight(), 100).map((d) => d.token)).toEqual(['gun', 'tomo', 'lale'])
    expect(diceDue(fight(), 101).map((d) => d.token)).toEqual(['gun', 'lale'])
    expect(diceDue(fight(), 102)).toEqual([])
  })
  it('are only the newcomer when someone joins later', () => {
    const f = fight({ fighters: [x('gun'), x('fixer', 10, 200), x('tomo'), x('lale')] })
    const [due, ...rest] = diceDue(f, 200)
    expect(rest).toEqual([])
    expect(due.token).toBe('fixer')
    expect(due.land).toBeCloseTo(200.9)
  })
})

describe('whose turn is next', () => {
  it('skips whoever is down', () => {
    expect(nextUp(fight())).toBe('tomo')
    expect(nextUp(fight({ fighters: [x('gun'), x('tomo', 0), x('lale')] }))).toBe('lale')
    expect(nextUp(fight({ now: 'lale' }))).toBe('gun')
  })
})

describe('the looping strip', () => {
  it('puts whoever is up in the middle, and hides a round before the first', () => {
    const s = carousel(3, 3, 1)
    expect(s.filter((q) => q.off === 0).map((q) => q.k)).toEqual([0])
    expect(s.slice(0, 3).every((q) => q.hidden)).toBe(true) // there's no round 0
    expect(s.slice(6, 9).map((q) => q.round)).toEqual([2, 2, 2])
  })
  it('wraps into the next round and lands on the same picture one round on', () => {
    // the last fighter of round 1 is up (pos 5); Next slides into round 2's copy (pos 6), then snaps back (pos 3)
    const slid = carousel(3, 6, 2)
    const snapped = carousel(3, 3, 2)
    const view = (s: ReturnType<typeof carousel>) => s.filter((q) => !q.hidden).map((q) => [q.off, q.k, q.round])
    expect(view(slid)).toEqual(view(snapped))
  })
})
