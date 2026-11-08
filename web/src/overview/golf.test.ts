import { describe, expect, it } from 'vitest'
import type { GolfGreen } from '../types'
import { BACK, HOLE, SWZ, TEE, freshGame, params, proj, readPull, step, strike, unproj, type Game, type Params } from './golf'

const green = (over: Partial<GolfGreen> = {}): Params => params({ header: '', well: 'gentle', sweeper: false, turnstile: false, curve: true, ...over })

function roll(g: Game, P: Params) {
  for (let i = 0; i < 240 * 30 && !g.ended; i++) {
    g.t += 1 / 240
    step(g, P, 1 / 240)
  }
  return g
}

const putt = (P: Params, aim: number, p: number, curve = 0, t = 0) => {
  const g = freshGame(t)
  strike(g, aim, p, curve)
  return roll(g, P)
}

const atCup = (Math.atan2(HOLE.x, HOLE.z - TEE) * 180) / Math.PI

describe('the controls', () => {
  const d = (dx: number, dy: number) => ({ sx: 100, sy: 100, x: 100 + dx, y: 100 + dy, aim: 0 })

  it('cancels inside the small ring', () => {
    expect(readPull(d(3, 3), true)).toMatchObject({ cancel: true, p: 0 })
  })

  it('reads power from how far you drag, and tops out', () => {
    expect(readPull(d(0, 36), true).p).toBeCloseTo(0.5)
    expect(readPull(d(0, 300), true).p).toBe(1)
  })

  it('curves the way you drag, and straight down is no curve', () => {
    expect(readPull(d(0, 40), true).curve).toBe(0)
    expect(readPull(d(-40, 10), true).curve).toBeLessThan(0)
    expect(readPull(d(40, 10), true).curve).toBeGreaterThan(0)
    expect(readPull(d(40, 10), false).curve).toBe(0)
  })

  it('finds where you pressed on the floor', () => {
    const p = proj(0.5, 0, 4)
    const w = unproj(p.x, p.y)
    expect(w.x).toBeCloseTo(0.5)
    expect(w.z).toBeCloseTo(4)
  })
})

describe('the putt', () => {
  it('sinks at around 60% on line', () => {
    const g = putt(green(), atCup, 0.6)
    expect(g.ended).toBe('in')
    expect(g.inCup).toBe(true)
  })

  it('skips a fast ball over the rim', () => {
    expect(putt(green(), atCup, 1).lipped).toBe(true)
  })

  it('stops short when it is hit soft', () => {
    const g = putt(green(), atCup, 0.2)
    expect(g.ended).toBe('stop')
    expect(g.ball.z).toBeLessThan(HOLE.z)
  })

  it('drops a long ball down the duct', () => {
    const aim = (Math.atan2(-0.75, BACK - TEE) * 180) / Math.PI
    const g = putt(green(), aim, 1)
    expect(g.ended).toBe('duct')
    expect(g.gone).toBe(true)
  })

  it('bends the ball the way it was curved', () => {
    const left = putt(green({ well: 'off' }), 0, 0.5, -2)
    const right = putt(green({ well: 'off' }), 0, 0.5, 2)
    expect(left.ball.x).toBeLessThan(-0.05)
    expect(right.ball.x).toBeGreaterThan(0.05)
  })

  it('bounces off the sweeper', () => {
    const g = freshGame(0)
    g.ball = { x: 0, z: 3.9, vx: 0, vz: 2 }
    const P = green({ sweeper: true })
    let bounced = false
    for (let i = 0; i < 120 && !g.ended; i++) {
      g.t += 1 / 240
      step(g, P, 1 / 240)
      bounced ||= g.ball.vz < 0
      expect(g.ball.z).toBeLessThan(SWZ)
    }
    expect(bounced).toBe(true)
  })

  it('can be holed with everything on the green, if you time it', () => {
    const P = green({ sweeper: true, turnstile: true })
    const holed = Array.from({ length: 200 }, (_, i) => putt(P, atCup, 0.6, 0, i * 0.1)).filter((g) => g.ended === 'in')
    expect(holed.length).toBeGreaterThan(0)
  })
})
