import { useEffect, useMemo } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { useGame } from '../store/game'
import { DeckMusic, volumeGain } from './music'

/**
 * The Sound deck's music, on the TV: the track the GM picked, looping until another is picked. It steps aside while
 * something else has the TV's sound (a film, the opening, a Burn, a minigame) and comes back after; rolls, pads and
 * the sounds that play by themselves go over it.
 */
export function TvMusic({ sound }: { sound: RollSound | null }) {
  const music = useGame((s) => s.view?.stage.music)
  const files = useGame((s) => s.view?.stage.music_files)
  const busy = useGame((s) => {
    const v = s.view
    return !!v && !!(v.stage.film || v.stage.opening || v.stage.burn || v.stage.npc_burn || v.rush || (v.race && 'seed' in v.race))
  })
  const ac = sound?.context ?? null
  const deck = useMemo(() => (ac ? new DeckMusic(ac, () => serverClock.now() / 1000) : null), [ac])
  useEffect(() => () => deck?.close(), [deck])

  useEffect(() => {
    if (deck && files) Object.values(files).forEach((f) => void deck.fetch(f.src)) // every file ahead, so a track starts at once
  }, [deck, files])

  const volume = music?.volume
  useEffect(() => {
    if (deck && volume !== undefined) deck.volume(volumeGain(volume))
  }, [deck, volume])

  useEffect(() => deck?.hold(busy), [deck, busy])

  const track = music?.track ?? null
  const at = music?.at ?? 0
  const fade = music?.fade ?? 1.5
  useEffect(() => {
    if (!deck) return
    const f = track && files?.[track]
    deck.set(f ? { id: track, src: f.src, loopFrom: f.loop_from, at, fade } : null)
  }, [deck, files, track, at, fade])

  return null
}
