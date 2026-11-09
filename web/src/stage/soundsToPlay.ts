import type { SoundPlayed } from '../types'

const STALE = 2 // seconds: a press older than this happened while the TV was away, and isn't played on its return

/** The presses the TV hasn't played yet. A quick run of them can arrive in one frame. */
export const soundsToPlay = (played: SoundPlayed[], since: number, now: number) => played.filter((p) => p.at > since && now - p.at < STALE)
