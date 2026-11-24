import { describe, expect, it } from 'vitest'
import fixture from './proto.fixture.json'
import { advance, buildTrack, newRace, ranked, runToEnd, type Entry } from './sim'

const track = buildTrack()

// The prototype's own race code played these (scripts/race_fixture.mjs): the port has to run every one the same.
describe('the race is the prototype', () => {
  for (const c of fixture.cases) {
    it(`seed ${c.seed}${c.final ? ', the final' : ''}, ${c.entries.length} bots`, () => {
      const r = runToEnd(c.entries as Entry[], c.final ? 3 : 5, c.seed, c.final, track)
      expect({
        order: ranked(r).map((b) => b.id),
        fin: r.bots.map((b) => Math.round(b.fin * 1e6) / 1e6),
        wall: Math.round(r.wall * 1e6) / 1e6,
        lines: r.lines.map((l) => l[1]),
      }).toEqual(c.result)
    })
  }
})

// A grid to measure the balance on: the best-prepared bot (tight, a quick fuel, a perfect launch), one with a loose
// wheel, and three house bots. With the prototype's constants over many races the best wins about 42%, each house bot
// about 16% and the loose wheel about 9.5%; in the final the best-prepared player beats CSAT-1 about 66% of the time.
// (The brief's rough 36 / 15 / 8 / 60 came from a grid that isn't written down; the code is the prototype's exactly.)
const grid: Entry[] = [
  { id: 'best', name: 'STAT', color: '#a8f4c4', grip: 1.15, fuel: 1.02, launch: 1 },
  { id: 'loose', name: 'ALIBI', color: '#ff8ac4', grip: 0.7, fuel: 1, launch: 0.6 },
  { id: 'house0', name: 'MOPSY', color: '#b79cff', grip: 1, fuel: 1, launch: 0.6 },
  { id: 'house1', name: 'UNIT 9', color: '#e6e8f0', grip: 1, fuel: 1, launch: 0.6 },
  { id: 'house2', name: 'BIG SCRUB', color: '#c6e84e', grip: 1, fuel: 1, launch: 0.6 },
]
const CSAT: Entry = { id: 'csat', name: 'CSAT-1', color: '#f4ecd4', csat: true, grip: 1.2, fuel: 1, launch: 0.7 }

function wins(entries: Entry[], laps: number, final: boolean, n: number) {
  const won: Record<string, number> = {}
  let longest = 0
  for (let seed = 1; seed <= n; seed++) {
    const r = runToEnd(entries, laps, seed * 7919, final, track)
    const w = ranked(r)[0].id
    won[w] = (won[w] ?? 0) + 1
    longest = Math.max(longest, r.wall)
  }
  return { share: (id: string) => (won[id] ?? 0) / n, longest }
}

describe('the balance, as tuned', () => {
  it('in a race, the best-prepared bot wins about 42%, a house bot about 16%, a loose wheel about 9.5%', () => {
    const w = wins(grid, 5, false, 1500)
    expect(w.share('best')).toBeGreaterThan(0.37)
    expect(w.share('best')).toBeLessThan(0.47)
    for (const h of ['house0', 'house1', 'house2']) {
      expect(w.share(h)).toBeGreaterThan(0.12)
      expect(w.share(h)).toBeLessThan(0.21)
    }
    expect(w.share('loose')).toBeGreaterThan(0.06)
    expect(w.share('loose')).toBeLessThan(0.13)
  })

  it('in the final, a well-prepared player beats CSAT-1 about 66% of the time', () => {
    const w = wins([grid[0], CSAT], 3, true, 1500)
    expect(w.share('best')).toBeGreaterThan(0.6)
    expect(w.share('best')).toBeLessThan(0.72)
  })

  it('the Satisfaction Cup burned on an otherwise stock bot wins about 65% against four house bots', () => {
    const cup: Entry = { id: 'cup', name: 'CUP', color: '#ffffff', grip: 1, fuel: 1.08, launch: 0.6 }
    const w = wins([cup, ...grid.slice(2), { ...grid[2], id: 'house3' }], 5, false, 1500)
    expect(w.share('cup')).toBeGreaterThan(0.58)
    expect(w.share('cup')).toBeLessThan(0.72)
  })
})

describe('a TV that reloads catches up', () => {
  it('stepping live, frame by frame, and catching up at once land on the same race', () => {
    for (const upto of [2, 40, 90]) {
      const live = newRace(track, grid, 5, 424242, false)
      let last = 0
      for (let wall = 0; wall < upto; wall += 0.0173 + (wall % 0.011)) advance(live, (last = wall)) // uneven frames
      const late = newRace(track, grid, 5, 424242, false)
      advance(late, last) // the same moment, all at once
      expect(late.wall).toBe(live.wall)
      expect(late.over).toBe(live.over)
      expect(late.bots.map((b) => [b.s, b.v, b.st])).toEqual(live.bots.map((b) => [b.s, b.v, b.st]))
      expect(late.lines).toEqual(live.lines)
    }
  })

  it('the longest race, from the lights to the flag, is well under the two minutes the server allows', () => {
    expect(wins(grid, 5, false, 600).longest).toBeLessThan(100)
    expect(wins([grid[0], CSAT], 3, true, 600).longest).toBeLessThan(100)
  })
})
