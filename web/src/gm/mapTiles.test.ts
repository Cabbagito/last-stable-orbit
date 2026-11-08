import { describe, expect, it } from 'vitest'
import type { View } from '../types'
import { isFar, nowTiles } from './mapTiles'

const tok = (id: string, map: string, kind = 'crew') => ({ id, map, kind, ref: id })

function view(tokens: ReturnType<typeof tok>[], fights: { map: string; round: number }[] = [], lit: string[] = ['bar']): View {
  return {
    party_map: 'bar',
    crew: [],
    tokens: Object.fromEntries(tokens.map((t) => [t.id, t])),
    fights,
    maps: { bar: {}, street: {}, deck: {} },
    station: { places: ['bar', 'street', 'deck'].map((id) => ({ id, lit: lit.includes(id) })) },
  } as unknown as View
}

describe('nowTiles', () => {
  const cases: [string, View, string | null, [string, string, number | null][]][] = [
    ['everyone together', view([tok('a', 'bar'), tok('b', 'bar')]), null, [['bar', 'The party', null]]],
    ['someone split off', view([tok('a', 'bar'), tok('b', 'street')]), null, [['bar', 'The party', null], ['street', 'Split off', null]]],
    ['a fight where the party is', view([tok('a', 'bar')], [{ map: 'bar', round: 2 }]), null, [['bar', 'The party', 2]]],
    ['a fight elsewhere', view([tok('a', 'bar')], [{ map: 'deck', round: 1 }]), null, [['bar', 'The party', null], ['deck', 'A fight', 1]]],
    ['the last map', view([tok('a', 'bar')]), 'deck', [['bar', 'The party', null], ['deck', 'Last looked at', null]]],
    ['the last map is already listed', view([tok('a', 'bar')]), 'bar', [['bar', 'The party', null]]],
    ['an NPC elsewhere is nothing', view([tok('a', 'bar'), tok('g', 'deck', 'npc')]), null, [['bar', 'The party', null]]],
  ]
  it.each(cases)('%s', (_n, v, last, want) => {
    expect(nowTiles(v, last).map((t) => [t.map, t.lab, t.fight])).toEqual(want)
  })
})

describe('isFar', () => {
  it('is a dark place with no crew on it', () => {
    expect(isFar(view([tok('a', 'bar')]), 'deck')).toBe(true)
  })
  it('is not a lit place', () => {
    expect(isFar(view([tok('a', 'bar')]), 'bar')).toBe(false)
  })
  it('is not a dark place with crew on it', () => {
    expect(isFar(view([tok('a', 'bar'), tok('b', 'deck')]), 'deck')).toBe(false)
  })
})
