import { describe, expect, it } from 'vitest'
import { coins, rateLabel, seatsLabel, secondsLeft, spinSeconds } from './slots'

describe('the slots', () => {
  it('holds a near miss longer', () => {
    expect(Math.max(...spinSeconds(true))).toBeGreaterThan(Math.max(...spinSeconds(false)))
  })
  it.each([
    [0, '0 OF 4 SEATS TAKEN'],
    [2, '2 OF 4 SEATS TAKEN'],
    [4, 'ALL FOUR SEATS TAKEN'],
  ])('counts %i seats', (taken, label) => expect(seatsLabel(taken, 4)).toBe(label))
  it('counts the shared window down', () => {
    expect(secondsLeft(1004, 1000_000, 4)).toBe(4)
    expect(secondsLeft(1004, 1002_500, 4)).toBe(2)
    expect(secondsLeft(1004, 1005_000, 4)).toBe(0)
    expect(secondsLeft(null, 1000_000, 4)).toBe(0)
    expect(secondsLeft(1010, 1000_000, 4)).toBe(4) // a skewed clock never shows more pips than there are
  })
  it('writes the rates as the service page does', () => {
    expect([50, 110, 200, 1000].map(rateLabel)).toEqual(['.5', '1.1', '2', '10'])
  })
  it('throws the same coins every time', () => {
    expect(coins(3, 7, 230, 70, 80, 0.45, [0.75, 0.4])).toEqual(coins(3, 7, 230, 70, 80, 0.45, [0.75, 0.4]))
  })
})
