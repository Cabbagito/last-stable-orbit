import { describe, expect, it } from 'vitest'
import type { InvEntry } from '../types'
import { itemLabel, shortCount } from './items'

const entry = (over: Partial<InvEntry> & { counted?: boolean }): InvEntry => ({
  uid: 'i1',
  item: { id: 'credits', name: 'Credits', icon: '/assets/icons/items/credits.png', kind: 'cash', text: '', counted: !!over.counted },
  count: null,
  new: false,
  ...over,
})

describe('items on the sheet', () => {
  it('fits the count badge in 48 px', () => {
    expect([0, 140, 9999, 10000, 12345, 999999].map(shortCount)).toEqual(['0', '140', '9999', '10k', '12k', '999k'])
  })
  it('says the amount and whether it is new', () => {
    expect(itemLabel(entry({ counted: true, count: 140 }))).toBe('Credits, 140')
    expect(itemLabel(entry({ new: true }))).toBe('Credits, new')
  })
})
