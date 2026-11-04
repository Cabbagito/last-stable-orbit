import type { InvEntry } from '../types'

/** 140, 9999, then 12k: the badge has 48 px. The tooltip shows the full amount. */
export const shortCount = (n: number) => (n < 10000 ? String(n) : `${Math.floor(n / 1000)}k`)

/** What a screen reader hears for an item on the sheet. */
export const itemLabel = (e: InvEntry) =>
  (e.item.counted ? `${e.item.name}, ${e.count ?? 0}` : e.item.name) + (e.new ? ', new' : '')
