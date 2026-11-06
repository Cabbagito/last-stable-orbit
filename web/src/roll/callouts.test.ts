import { describe, expect, it } from 'vitest'
import type { RollView } from '../types'
import { FADE, LINGER, calloutsBy, emptyMemo, remember } from './callouts'

const roll = (id: string, open: boolean, char = 'ves'): RollView => ({
  id, by: char, char, token: char, stat: 'tech', sides: 10, phase: open ? 'roll' : 'land', open, pushes: 0, pushed: 0, failed: false, sealed: false, god: false, started: 0,
})
const byChar = (r: RollView) => r.char

describe('roll callouts', () => {
  it('show while open, linger after the close, then fade and go', () => {
    let m = remember(emptyMemo(), [roll('r1', true)], 0).memo
    expect(calloutsBy([roll('r1', true)], m, 0, byChar).ves.fading).toBe(false)
    const step = remember(m, [roll('r1', false)], 1000)
    m = step.memo
    expect(step.closed).toEqual(['r1'])
    expect(calloutsBy([roll('r1', false)], m, 1000 + LINGER - 1, byChar).ves.fading).toBe(false)
    expect(calloutsBy([roll('r1', false)], m, 1000 + LINGER + 1, byChar).ves.fading).toBe(true)
    expect(calloutsBy([roll('r1', false)], m, 1000 + LINGER + FADE + 1, byChar)).toEqual({})
    // a later frame doesn't restart the linger
    m = remember(m, [roll('r1', false)], 3000).memo
    expect(m.closedAt.r1).toBe(1000)
  })

  it('never shows a roll that was over before this screen connected', () => {
    const m = remember(emptyMemo(), [roll('r1', false)], 0).memo
    expect(calloutsBy([roll('r1', false)], m, 10, byChar)).toEqual({})
  })

  it("shows each roller's newest roll only", () => {
    const rolls = [roll('r1', false), roll('r2', true), roll('r3', true, 'tally')]
    const m = remember(emptyMemo(), rolls, 0).memo
    const out = calloutsBy(rolls, m, 0, byChar)
    expect(out.ves.r.id).toBe('r2')
    expect(out.tally.r.id).toBe('r3')
  })
})
