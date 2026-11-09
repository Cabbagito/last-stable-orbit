import { useEffect, useRef } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { useGame } from '../store/game'
import { soundsToPlay } from './soundsToPlay'

/** The GM's soundboard, on the TV. Every clip is fetched and decoded ahead, so a press plays at once. */
export function TvSounds({ sound }: { sound: RollSound | null }) {
  const played = useGame((s) => s.view?.stage.sounds)
  const files = useGame((s) => s.view?.stage.sound_files)
  const decoded = useRef(new Map<string, Promise<AudioBuffer | null>>())
  const since = useRef(serverClock.now() / 1000)

  useEffect(() => {
    if (!sound || !files) return
    const load = (src: string) => {
      let clip = decoded.current.get(src)
      if (!clip) {
        clip = fetch(src)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(src))))
          .then((bytes) => sound.decode(bytes))
          .catch(() => {
            decoded.current.delete(src) // the next press tries again
            return null
          })
        decoded.current.set(src, clip)
      }
      return clip
    }
    Object.values(files).forEach((src) => void load(src))
    for (const p of soundsToPlay(played ?? [], since.current, serverClock.now() / 1000)) {
      const src = files[p.id]
      if (src) void load(src).then((clip) => clip && sound.clip(clip))
    }
  }, [sound, files, played])

  useEffect(() => {
    for (const p of played ?? []) since.current = Math.max(since.current, p.at) // before the start click too: those stay unheard
  }, [played])

  return null
}
