import { describe, expect, it } from 'vitest'
import { GATE_WAIT, RollClock } from './clock'
import { RollFX } from './rollfx'

const plan = RollFX.plan({ mode: 'reel', rolls: [20, 20, 5], sides: 20, seed: 7, color: '#ffd166', style: 'custom' })

/** Drive a clock with ticks every `step` ms (16 = a visible tab, 1000 = Chrome's background-tab timers). */
function run(step: number, press?: (c: RollClock, now: number) => void) {
  const lands: [number, number][] = []
  const gates: boolean[] = []
  let doneAt = -1
  const c = new RollClock(plan, 0, { land: (k) => lands.push([k, now]), gate: (o) => gates.push(o), done: () => (doneAt = now) })
  let now = 0
  for (; now < 120_000 && !c.done; now += step) {
    c.tick(now)
    press?.(c, now)
  }
  return { lands, gates, doneAt }
}

describe('the roll clock', () => {
  it('lands every die on time, explosions included', () => {
    const { lands, gates, doneAt } = run(16)
    expect(plan.gates.length).toBe(2)
    expect(lands.map(([k]) => k)).toEqual([1, 2, 3])
    const first = plan.passes[0].start + plan.passes[0].dur
    expect(lands[0][1] / 1000).toBeCloseTo(first, 1)
    expect(gates).toEqual([true, false, true, false]) // each explosion held, then let go by itself
    // each gate holds GATE_WAIT seconds when nobody presses "Roll again"
    expect(doneAt / 1000).toBeCloseTo(plan.T + 2 * GATE_WAIT, 0)
  })

  it('keeps going in a background tab, each die at most one timer tick late', () => {
    const fg = run(16)
    const bg = run(1000)
    expect(bg.lands.map(([k]) => k)).toEqual([1, 2, 3])
    bg.lands.forEach(([, at], i) => expect(Math.abs(at - fg.lands[i][1])).toBeLessThanOrEqual(1000))
    expect(Math.abs(bg.doneAt - fg.doneAt)).toBeLessThanOrEqual(1000)
  })

  it('one very late tick catches up through every explosion', () => {
    const lands: number[] = []
    const c = new RollClock(plan, 0, { land: (k) => lands.push(k), gate: () => undefined, done: () => undefined })
    c.tick(60_000) // the laptop slept through the whole roll
    expect(lands).toEqual([1, 2, 3])
    expect(c.done).toBe(true)
  })

  it('"Roll again" lets an explosion go at once, and Skip jumps to the end', () => {
    const pressed = run(16, (c, now) => c.release(now))
    expect(pressed.doneAt / 1000).toBeCloseTo(plan.T, 0)
    const c = new RollClock(plan, 0, { land: () => undefined, gate: () => undefined, done: () => undefined })
    c.tick(100)
    c.skip()
    c.tick(116)
    expect(c.done).toBe(true)
  })
})
