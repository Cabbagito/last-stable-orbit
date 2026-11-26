import type { SoundPlayed } from '../types'

const STALE = 2 // seconds: a sound older than this happened while the TV was away, and isn't played on its return

const key = (p: SoundPlayed) => `${p.id}@${p.at}`

/**
 * The sounds the TV hasn't played yet, and marks them played. A quick run of them can arrive in one frame, and one can
 * be timed a moment ahead (arriving somewhere lands as the new map comes up), so each is told apart by what it is and
 * when, never by how late the last one was. Nothing from before the TV started (`since`) plays.
 */
export function soundsToPlay(played: SoundPlayed[], since: number, now: number, done: Set<string>): SoundPlayed[] {
  const fresh = played.filter((p) => p.at > since && now - p.at < STALE && !done.has(key(p)))
  const listed = new Set(played.map(key))
  for (const k of done) if (!listed.has(k)) done.delete(k) // the server keeps only the last few: so do we
  for (const p of fresh) done.add(key(p))
  return fresh
}
