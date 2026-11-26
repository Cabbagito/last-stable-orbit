import { describe, expect, it } from 'vitest'
import { digit, isCameraKey, resolve, type Ctx } from './bindings'

const key = (code: string, shift = false, k = '') => ({ code, key: k || code, shift })
const player: Ctx = { role: 'player', tab: 'scene', dialog: false, chord: null }
const gm: Ctx = { role: 'gm', tab: 'scene', dialog: false, chord: null }

describe('keys', () => {
  it('reads digits by position, 0 as the tenth', () => {
    expect(digit('Digit1')).toBe(0)
    expect(digit('Digit0')).toBe(9)
    expect(digit('Numpad3')).toBe(2)
    expect(digit('KeyA')).toBe(-1)
  })

  it('moves the camera with WASD, the arrows, Q and E', () => {
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'KeyQ', 'KeyE']) expect(isCameraKey(c)).toBe(true)
    expect(isCameraKey('KeyR')).toBe(false)
  })

  it('gives players three tabs and the GM four', () => {
    expect(resolve(key('Digit3'), player)).toEqual({ a: 'tab', tab: 'codex' })
    expect(resolve(key('Digit4'), player)).toBeNull()
    expect(resolve(key('Digit4'), gm)).toEqual({ a: 'tab', tab: 'gm' })
  })

  it('opens ? on any layout', () => {
    expect(resolve(key('Minus', true, '?'), player)).toEqual({ a: 'help' }) // Serbian Latin: ? is Shift and the minus key
    expect(resolve(key('Slash', true, '/'), gm)).toEqual({ a: 'help' })
  })

  it('on the roll screen, 1-6 are stats, 7 8 9 0 skills, and the tabs are off', () => {
    const d = { ...player, dialog: true }
    expect(resolve(key('Digit2'), d)).toEqual({ a: 'stat', i: 1 })
    expect(resolve(key('Digit7'), d)).toEqual({ a: 'entry', i: 0 })
    expect(resolve(key('Digit0'), d)).toEqual({ a: 'entry', i: 3 })
    expect(resolve(key('Enter'), d)).toEqual({ a: 'enter' })
    expect(resolve(key('KeyP'), d)).toEqual({ a: 'hold', h: 'push' })
    expect(resolve(key('KeyB'), d)).toEqual({ a: 'hold', h: 'burn' })
    expect(resolve(key('KeyR'), d)).toBeNull()
  })

  it('players Burn with B, the GM opens the Sound deck with it', () => {
    expect(resolve(key('KeyB'), player)).toEqual({ a: 'hold', h: 'burn' })
    expect(resolve(key('KeyB'), gm)).toEqual({ a: 'sound' })
  })

  it('B, then two digits, plays a sound', () => {
    expect(resolve(key('Digit2'), { ...gm, chord: 'sound' })).toEqual({ a: 'soundCat', i: 1 })
    expect(resolve(key('Digit0'), { ...gm, chord: 'soundCat' })).toEqual({ a: 'soundPlay', i: 9 })
    expect(resolve(key('KeyX'), { ...gm, chord: 'sound' })).toBeNull()
  })

  it('R, then a stat (and G for God), rolls for the NPC', () => {
    expect(resolve(key('KeyR'), gm)).toEqual({ a: 'roll' })
    expect(resolve(key('Digit6'), { ...gm, chord: 'roll' })).toEqual({ a: 'stat', i: 5 })
    expect(resolve(key('Digit7'), { ...gm, chord: 'roll' })).toBeNull()
    expect(resolve(key('KeyG'), { ...gm, chord: 'roll' })).toEqual({ a: 'god' })
  })

  it('keeps GM keys from players', () => {
    for (const c of ['KeyM', 'KeyN', 'KeyT', 'KeyG']) expect(resolve(key(c), player)).toBeNull()
    expect(resolve(key('Digit1', true), player)).toBeNull()
    expect(resolve(key('Digit1', true), gm)).toEqual({ a: 'follow', i: 0 })
  })

  it('M only on the Scene', () => {
    expect(resolve(key('KeyM'), gm)).toEqual({ a: 'mapPicker' })
    expect(resolve(key('KeyM'), { ...gm, tab: 'codex' })).toBeNull()
  })
})
