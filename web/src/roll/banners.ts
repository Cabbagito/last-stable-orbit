import type { RollView } from '../types'

// When a roll's banner shows on a screen (Round 17). It comes in when the dice start, leaves LEAVE ms after they
// land, and a push after that pops it back for REPUSH ms. Its own timeline, kept per screen: it doesn't wait for the
// roller to close their roll screen, as the chip on the token does. A roll already over when this screen connected
// never shows, so a reload doesn't replay old results; nor does your own, which plays on your roll screen.
export const LEAVE = 4000
export const REPUSH = 3000
export const OUT = 500 // the slide away
export const MAX_PLATES = 3

export type PlatePhase = 'roll' | 'boom' | 'seal' | 'land' | 'nat1' | 'push' | 'repush' | 'out'

export interface PlateEntry {
  landedAt: number | null
  leaveAt: number | null
  pushes: number
  repush: boolean // the last push came after the banner had left
}
export type PlateMemo = Record<string, PlateEntry>

export interface LivePlate {
  r: RollView
  phase: PlatePhase
  quiet: boolean // the GM's own roll on their own laptop: no flash and no shake, it's only telling them
}

const flying = (r: RollView) => r.phase === 'roll' || r.phase === 'boom'

/** Fold a new list of rolls into the memo. `wake`: ms from now when a banner changes on its own. */
export function foldPlates(memo: PlateMemo, rolls: RollView[], now: number, seat: string, firstFrame: boolean): { memo: PlateMemo; wake: number[] } {
  const next: PlateMemo = {}
  const wake: number[] = []
  for (const r of rolls) {
    if (r.by === seat && seat !== 'gm') continue
    const was = memo[r.id]
    if (!was && !r.open) continue
    if (!was && firstFrame && !flying(r)) {
      next[r.id] = { landedAt: now, leaveAt: now - LEAVE - OUT, pushes: r.pushes, repush: false } // landed before we connected
      continue
    }
    const e: PlateEntry = was ? { ...was } : { landedAt: null, leaveAt: null, pushes: r.pushes, repush: false }
    if (!flying(r) && e.landedAt === null) {
      e.landedAt = now
      e.leaveAt = now + LEAVE
      wake.push(LEAVE, LEAVE + OUT)
    }
    if (r.pushes > e.pushes) {
      const left = e.leaveAt !== null && now >= e.leaveAt
      e.repush = left
      e.leaveAt = Math.max(e.leaveAt ?? 0, now + REPUSH)
      e.pushes = r.pushes
      wake.push(e.leaveAt - now, e.leaveAt - now + OUT)
    }
    next[r.id] = e
  }
  return { memo: next, wake }
}

/** Where a roll's banner is at `now`, or null when it isn't up. */
export function platePhase(e: PlateEntry, r: RollView, now: number): PlatePhase | null {
  if (e.leaveAt === null) return r.phase === 'boom' ? 'boom' : 'roll'
  if (now >= e.leaveAt + OUT) return null
  if (now >= e.leaveAt) return 'out'
  if (r.phase === 'push') return e.repush ? 'repush' : 'push'
  return r.phase === 'seal' || r.phase === 'nat1' ? r.phase : 'land'
}

/** The banners up now, oldest first: each roller's newest, and only a few at once. A God roll has its own screen. */
export function livePlates(rolls: RollView[], memo: PlateMemo, now: number, isGm: boolean): LivePlate[] {
  const newest = new Map<string, LivePlate>()
  for (const r of rolls) {
    const e = memo[r.id]
    if (!e || (r.god && !isGm)) continue
    const phase = platePhase(e, r, now)
    const who = r.char ?? r.token ?? r.id
    newest.delete(who)
    if (phase) newest.set(who, { r, phase, quiet: isGm && r.by === 'gm' })
  }
  return [...newest.values()].slice(-MAX_PLATES)
}
