import { describe, expect, it } from 'vitest'
import type { View } from '../types'
import { anchorStyle } from './anchor'
import { findObject, objectKey, stillThere } from './objects'

describe('the sheet inspector', () => {
  it('hangs down from things in the top half, and grows up from things lower down', () => {
    expect(anchorStyle({ key: 'row:0', left: 350, y: 300, vh: 900 })).toEqual({ style: { left: 350, top: 254 }, side: 'cl-top' })
    expect(anchorStyle({ key: 'item:a', left: 350, y: 800, vh: 900 })).toEqual({ style: { left: 350, bottom: 54 }, side: 'cl-bot' })
    expect(anchorStyle({ key: 'row:0', left: 350, y: 20, vh: 900 }).style.top).toBe(8) // never off the top
  })
})

describe('selecting things in the world', () => {
  const view = {
    tokens: { dax: {} },
    maps: { 'event-horizon': { objects: [{ id: 'mural', name: 'The mural' }] } },
  } as unknown as View

  it('finds an object by its key, and keeps a selection only while it is there', () => {
    const key = objectKey('event-horizon', 'mural')
    expect(findObject(view, key)?.obj.name).toBe('The mural')
    expect(findObject(view, 'dax')).toBeNull()
    expect(stillThere(view, key)).toBe(true)
    expect(stillThere(view, 'dax')).toBe(true)
    expect(stillThere(view, objectKey('event-horizon', 'slots'))).toBe(false) // hidden again: the card closes
    expect(stillThere(view, null)).toBe(false)
  })
})
