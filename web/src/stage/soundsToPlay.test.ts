import { describe, expect, it } from 'vitest'
import { soundsToPlay } from './soundsToPlay'

const press = (at: number, id = 'punch') => ({ id, at })

describe('soundsToPlay', () => {
  it('plays every sound since the TV started', () => {
    expect(soundsToPlay([press(10), press(11), press(12)], 10, 12.1, new Set()).map((p) => p.at)).toEqual([11, 12])
  })
  it('plays nothing it has played already', () => {
    const done = new Set<string>()
    expect(soundsToPlay([press(10), press(11)], 5, 11.1, done).map((p) => p.at)).toEqual([10, 11])
    expect(soundsToPlay([press(10), press(11)], 5, 11.2, done)).toEqual([])
    expect(soundsToPlay([press(10), press(11), press(11.3)], 5, 11.4, done).map((p) => p.at)).toEqual([11.3])
  })
  it('drops sounds from while the TV was away', () => {
    expect(soundsToPlay([press(10), press(100)], 5, 100.1, new Set()).map((p) => p.at)).toEqual([100])
  })
  it('still plays a press that comes after a sound timed ahead of it', () => {
    const done = new Set<string>()
    expect(soundsToPlay([press(20.4, 'arrive')], 5, 20, done).map((p) => p.id)).toEqual(['arrive']) // it lands in 0.4 s
    expect(soundsToPlay([press(20.4, 'arrive'), press(20.2)], 5, 20.2, done).map((p) => p.id)).toEqual(['punch'])
  })
  it('tells three quick heals apart', () => {
    const done = new Set<string>()
    const heals = [press(30, 'healed'), press(30.2, 'healed'), press(30.4, 'healed')]
    expect(soundsToPlay(heals, 5, 30.5, done)).toHaveLength(3)
    expect(soundsToPlay(heals, 5, 30.6, done)).toHaveLength(0)
  })
  it('forgets what the server has dropped from its list', () => {
    const done = new Set<string>()
    soundsToPlay([press(10)], 5, 10.1, done)
    soundsToPlay([press(11)], 5, 11.1, done)
    expect([...done]).toEqual(['punch@11'])
  })
})
