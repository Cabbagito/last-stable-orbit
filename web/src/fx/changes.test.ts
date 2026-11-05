import { describe, expect, it } from 'vitest'
import type { View } from '../types'
import { changes } from './changes'

const crew = (id: string, hp: number, entropy: number) => ({ id, hp, entropy, health: 9 })
const item = (uid: string, id: string, counted = false, count: number | null = null) => ({ uid, count, new: false, item: { id, name: id, icon: `/assets/icons/items/${id}.png`, kind: 'gear', text: '', counted, codex: null } })
const view = (over: Record<string, unknown> = {}) =>
  ({
    me: { seat: 'tomo', role: 'player', char: 'tomo' },
    crew: [crew('tomo', 7, 2), crew('ves', 4, 2)],
    inventory: { tomo: [item('t1', 'sourdough-jar'), item('t2', 'credits', true, 140)] },
    fights: [{ map: 'eh', name: 'EH', fighters: [{ token: 'gun', kind: 'npc', ref: 'hired-gun', name: 'Hired gun', portrait: '', color: '', hp: 4, health: 4 }] }],
    stage: { burn: null },
    ...over,
  }) as unknown as View

describe('what changed on the chips', () => {
  it.each([
    ['a hit', { crew: [crew('tomo', 5, 2), crew('ves', 4, 2)] }, [{ key: 'c:tomo', kind: 'hit', amount: -2, big: false }]],
    ['a big hit', { crew: [crew('tomo', 4, 2), crew('ves', 4, 2)] }, [{ key: 'c:tomo', kind: 'hit', amount: -3, big: true }]],
    ['down at 0', { crew: [crew('tomo', 7, 2), crew('ves', 0, 2)] }, [{ key: 'c:ves', kind: 'down', amount: -4, big: true }]],
    ['a heal', { crew: [crew('tomo', 9, 2), crew('ves', 4, 2)] }, [{ key: 'c:tomo', kind: 'heal', amount: 2 }]],
    ['Entropy up', { crew: [crew('tomo', 7, 3), crew('ves', 4, 2)] }, [{ key: 'c:tomo', kind: 'enUp', amount: 1 }]],
    ['Entropy spent', { crew: [crew('tomo', 7, 0), crew('ves', 4, 2)] }, [{ key: 'c:tomo', kind: 'enDown', amount: -2 }]],
  ])('%s', (_name, over, want) => {
    expect(changes(view(), view(over))).toEqual(want)
  })

  it('an NPC in a fight', () => {
    const hurt = view({ fights: [{ map: 'eh', name: 'EH', fighters: [{ token: 'gun', kind: 'npc', ref: 'hired-gun', name: '', portrait: '', color: '', hp: 2, health: 4 }] }] })
    expect(changes(view(), hurt)).toEqual([{ key: 't:gun', kind: 'hit', amount: -2, big: false }])
  })

  it('pockets: an item given and taken, credits up and down', () => {
    const given = view({ inventory: { tomo: [item('t1', 'sourdough-jar'), item('t2', 'credits', true, 140), item('t3', 'note')] } })
    expect(changes(view(), given)).toEqual([{ key: 'c:tomo', kind: 'got', icon: '/assets/icons/items/note.png', amount: undefined }])
    const taken = view({ inventory: { tomo: [item('t2', 'credits', true, 140)] } })
    expect(changes(view(), taken).map((c) => c.kind)).toEqual(['taken'])
    const paid = view({ inventory: { tomo: [item('t1', 'sourdough-jar'), item('t2', 'credits', true, 120)] } })
    expect(changes(view(), paid)).toEqual([{ key: 'c:tomo', kind: 'crDown', icon: '/assets/icons/items/credits.png', amount: -20 }])
  })

  it("a Burn's own mark takes the place of its Entropy spend", () => {
    const burn = view({ crew: [crew('tomo', 7, 0), crew('ves', 4, 2)], stage: { burn: { char: 'tomo', at: 5 } } })
    expect(changes(view(), burn)).toEqual([])
  })

  it("nothing on the first view, or when there's too much at once", () => {
    expect(changes(null, view())).toEqual([])
    const all = view({ crew: ['a', 'b', 'c', 'd', 'e'].map((id) => crew(id, 1, 0)) })
    const before = view({ crew: ['a', 'b', 'c', 'd', 'e'].map((id) => crew(id, 9, 6)) })
    expect(changes(before, all)).toEqual([])
  })
})
