import { describe, expect, it } from 'vitest'
import { BURN_FADE, BURN_LINGER, burnPhase, burnTicks } from './burntime'

const b = { char: 'lale', name: 'On your feet', color: '#a8f4c4', at: 100, ends: 103.584 }
const end = b.ends * 1000

describe('the Burn mark', () => {
  it('shows from the moment the Burn goes off until its film ends', () => {
    expect(burnPhase(b, 99_700)).toEqual({ phase: 'on', fading: false }) // the lead before the film starts
    expect(burnPhase(b, end - 1)).toEqual({ phase: 'on', fading: false })
  })

  it('stays a while after the film, then fades and goes', () => {
    expect(burnPhase(b, end)).toEqual({ phase: 'after', fading: false })
    expect(burnPhase(b, end + BURN_LINGER - 1)).toEqual({ phase: 'after', fading: false })
    expect(burnPhase(b, end + BURN_LINGER)).toEqual({ phase: 'after', fading: true })
    expect(burnPhase(b, end + BURN_LINGER + BURN_FADE)).toBeNull()
    expect(burnPhase(null, end)).toBeNull()
  })

  it('redraws at the end of the film, the fade and the end of the mark, never in the past', () => {
    expect(burnTicks(b, end - 1000)).toEqual([1000, 1000 + BURN_LINGER, 1000 + BURN_LINGER + BURN_FADE])
    expect(burnTicks(b, end + 1000)).toEqual([BURN_LINGER - 1000, BURN_LINGER + BURN_FADE - 1000])
  })
})
