import type { RollView } from '../types'

// When a roll's callout shows on someone else's screen (Round 7): from the first die until the roller
// closes their roll screen, then LINGER more, then a FADE. A roll that was already over when this screen
// connected never shows, so a reload doesn't replay old results.
export const LINGER = 4000
export const FADE = 700

export interface CallMemo {
  seenOpen: Record<string, true>
  closedAt: Record<string, number>
}

export const emptyMemo = (): CallMemo => ({ seenOpen: {}, closedAt: {} })

/** Fold a new list of rolls into the memo. Returns the ids that just closed (to schedule their fade). */
export function remember(memo: CallMemo, rolls: RollView[], now: number): { memo: CallMemo; closed: string[] } {
  const seenOpen: CallMemo['seenOpen'] = {}
  const closedAt: CallMemo['closedAt'] = {}
  const closed: string[] = []
  for (const r of rolls) {
    if (memo.seenOpen[r.id] || r.open) seenOpen[r.id] = true
    if (r.id in memo.closedAt) closedAt[r.id] = memo.closedAt[r.id]
    else if (!r.open && memo.seenOpen[r.id]) {
      closedAt[r.id] = now
      closed.push(r.id)
    }
  }
  return { memo: { seenOpen, closedAt }, closed }
}

export type CallState = 'on' | 'fading' | null

export function callState(r: RollView, memo: CallMemo, now: number): CallState {
  if (r.open) return 'on'
  const at = memo.closedAt[r.id]
  if (at === undefined) return null
  const age = now - at
  return age < LINGER ? 'on' : age < LINGER + FADE ? 'fading' : null
}

/** The callout for each target (a token id or a character id): its newest roll, if that one is showing. */
export function calloutsBy(
  rolls: RollView[],
  memo: CallMemo,
  now: number,
  key: (r: RollView) => string | null,
): Record<string, { r: RollView; fading: boolean }> {
  const newest: Record<string, RollView> = {}
  for (const r of rolls) {
    const k = key(r)
    if (k) newest[k] = r
  }
  const out: Record<string, { r: RollView; fading: boolean }> = {}
  for (const [k, r] of Object.entries(newest)) {
    const s = callState(r, memo, now)
    if (s) out[k] = { r, fading: s === 'fading' }
  }
  return out
}
