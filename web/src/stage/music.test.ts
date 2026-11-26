import { describe, expect, it } from 'vitest'
import { musicOffset, volumeGain } from './music'

describe('musicOffset', () => {
  it('starts at the top, and waits there for a first bar that is still ahead', () => {
    expect(musicOffset(0, 60, 0)).toBe(0)
    expect(musicOffset(-1.2, 60, 0)).toBe(0)
  })
  it('goes round the whole file when there is no opening', () => {
    expect(musicOffset(59, 60, 0)).toBe(59)
    expect(musicOffset(60, 60, 0)).toBe(0)
    expect(musicOffset(125, 60, 0)).toBe(5)
  })
  it('plays an opening once, then goes round from where the loop starts', () => {
    // Boss Battle #2: 39.72415 s of opening, then a 26.482766 s loop
    const L = 66.206916
    const from = 39.72415
    expect(musicOffset(20, L, from)).toBe(20)
    expect(musicOffset(50, L, from)).toBe(50)
    expect(musicOffset(L, L, from)).toBeCloseTo(from, 9)
    expect(musicOffset(L + 3, L, from)).toBeCloseTo(from + 3, 9)
    expect(musicOffset(L + 10 * (L - from) + 3, L, from)).toBeCloseTo(from + 3, 6)
  })
  it('never lands in the opening again, or past the end', () => {
    for (let el = 0; el < 2000; el += 7.3) {
      const at = musicOffset(el, 93.09093, 11.636372)
      expect(at).toBeGreaterThanOrEqual(el < 93.09093 ? 0 : 11.636372)
      expect(at).toBeLessThan(93.09093)
    }
  })
})

describe('volumeGain', () => {
  it('runs from silence to full', () => {
    expect(volumeGain(0)).toBe(0)
    expect(volumeGain(10)).toBe(1)
    expect(volumeGain(8)).toBeCloseTo(0.64)
    expect(volumeGain(99)).toBe(1)
  })
})
