import { describe, expect, it } from 'vitest'
import { soundsToPlay } from './soundsToPlay'

const press = (at: number) => ({ id: 'punch', at })

describe('soundsToPlay', () => {
  it('plays every press since the last one played', () => {
    expect(soundsToPlay([press(10), press(11), press(12)], 10, 12.1).map((p) => p.at)).toEqual([11, 12])
  })
  it('plays nothing it has played already', () => {
    expect(soundsToPlay([press(10), press(11)], 11, 11.1)).toEqual([])
  })
  it('drops presses from while the TV was away', () => {
    expect(soundsToPlay([press(10), press(100)], 5, 100.1).map((p) => p.at)).toEqual([100])
  })
})
