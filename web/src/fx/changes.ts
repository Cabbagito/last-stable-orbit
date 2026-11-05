import type { View } from '../types'

// M8, look C from Round 14 (R14ChipReact): every change the GM makes plays on that character's chip. This works out
// what changed between two views. Pockets play only where they're in the view: the holder's own screen and the GM's.

export type FxKind = 'hit' | 'heal' | 'enUp' | 'enDown' | 'got' | 'taken' | 'crUp' | 'crDown' | 'down'

export interface Change {
  key: string // "c:<character>" for the crew (rail ring and token), "t:<token>" for an NPC
  kind: FxKind
  amount?: number
  big?: boolean // a hit for 3 or more: a crack too
  icon?: string
}

const TOO_MANY = 8 // a preset load or a reconnect after a while: not a moment for fireworks

function npcHp(v: View): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of v.fights ?? []) for (const x of f.fighters) if (x.kind === 'npc') out[x.token] = x.hp
  return out
}

function hpChange(key: string, was: number, now: number): Change | null {
  if (now < was) return { key, kind: now <= 0 ? 'down' : 'hit', amount: now - was, big: was - now >= 3 }
  if (now > was) return { key, kind: 'heal', amount: now - was }
  return null
}

export function changes(prev: View | null, next: View): Change[] {
  if (!prev || prev.me.seat !== next.me.seat) return []
  const out: Change[] = []
  const b = next.stage.burn
  const burning = b && (!prev.stage.burn || prev.stage.burn.at !== b.at) ? b.char : null // a Burn has its own mark
  for (const c of next.crew) {
    const p = prev.crew.find((x) => x.id === c.id)
    if (!p) continue
    const h = hpChange(`c:${c.id}`, p.hp, c.hp)
    if (h) out.push(h)
    if (c.entropy > p.entropy) out.push({ key: `c:${c.id}`, kind: 'enUp', amount: c.entropy - p.entropy })
    else if (c.entropy < p.entropy && burning !== c.id) out.push({ key: `c:${c.id}`, kind: 'enDown', amount: c.entropy - p.entropy })
  }
  const was = npcHp(prev)
  for (const [token, hp] of Object.entries(npcHp(next))) {
    const h = token in was ? hpChange(`t:${token}`, was[token], hp) : null
    if (h) out.push(h)
  }
  for (const [holder, entries] of Object.entries(next.inventory)) {
    const before = prev.inventory[holder]
    if (!before) continue
    const key = `c:${holder}`
    for (const e of entries) {
      const o = before.find((x) => x.uid === e.uid)
      if (!o) out.push({ key, kind: e.item.counted ? 'crUp' : 'got', icon: e.item.icon, amount: e.count ?? undefined })
      else if (e.item.counted && (e.count ?? 0) !== (o.count ?? 0)) {
        const d = (e.count ?? 0) - (o.count ?? 0)
        out.push({ key, kind: d > 0 ? 'crUp' : 'crDown', icon: e.item.icon, amount: d })
      }
    }
    for (const o of before) {
      if (!entries.some((x) => x.uid === o.uid)) out.push({ key, kind: o.item.counted ? 'crDown' : 'taken', icon: o.item.icon, amount: o.item.counted ? -(o.count ?? 0) : undefined })
    }
  }
  return out.length > TOO_MANY ? [] : out
}
