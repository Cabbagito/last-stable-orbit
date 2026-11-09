import { useEffect, useMemo, useRef, useState } from 'react'
import { serverClock } from '../net/clock'
import { useGame } from '../store/game'
import type { FilmView } from '../types'
import { LaptopLoop, useLingering } from './LaptopLoop'

const DRIFT = 0.3 // seconds out of step before a playing film jumps back into step
const TICK = 100 // ms; a timer, not animation frames, so a background tab keeps time too

type Phase = 'idle' | 'wait' | 'play' | 'over'

/**
 * One film, in step with every other screen that plays it: it starts at the server moment `film.at`. A screen
 * that's late (it fetched the file slowly, or joined mid-film) jumps to where everyone else is. Full screen,
 * with no controls; it fades back to the map at the end. Mounted ahead with `film` null, it just fetches.
 * `hold`: when the video runs out, its last frame stays up until `ends` (a Burn: the server adds the hold to `ends`).
 */
export function FilmPlayer({ src, film, sound, hard = false, hold = false }: { src: string; film: FilmView | null | undefined; sound: boolean; hard?: boolean; hold?: boolean }) {
  const v = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [blocked, setBlocked] = useState(false) // the browser wouldn't start the sound by itself
  const active = !!film && film.src === src
  const at = film?.at ?? 0
  const ends = film?.ends ?? 0

  useEffect(() => {
    const el = v.current
    if (!el) return
    if (!active) {
      el.pause()
      setPhase('idle')
      return
    }
    let starting = false
    let ran = false // this run has started (a replay begins with the last run's end still on the element)
    let played = false // this run has started the video playing
    let timer = 0
    const tick = () => {
      const now = serverClock.now() / 1000
      const pos = now - at
      if (now >= ends || (!hold && ran && el.ended)) {
        el.pause()
        setPhase('over')
        return
      }
      timer = window.setTimeout(tick, TICK)
      if (pos < 0) {
        setPhase('wait')
        if (!el.paused) el.pause()
        if (el.currentTime > 0.05) el.currentTime = 0 // a replay: be ready at the start
        return
      }
      setPhase('play')
      ran = true
      if (hold && ((el.duration > 0 && pos >= el.duration) || (played && el.ended))) {
        // the video has run out: its last frame stays up until `ends`. Joined after the end: just that frame.
        if (!played && !el.paused) el.pause()
        if (!played && el.currentTime < el.duration) el.currentTime = el.duration
        return
      }
      if (!el.paused) {
        if (Math.abs(el.currentTime - pos) > DRIFT) el.currentTime = pos
        return
      }
      if (starting) return
      starting = true
      played = true
      if (Math.abs(el.currentTime - pos) > 0.1) el.currentTime = pos
      el.muted = !sound
      el.play()
        .catch(() => {
          // no sound without a click on this page yet: play it muted, and offer the sound
          el.muted = true
          if (sound) setBlocked(true)
          return el.play()
        })
        .catch(() => undefined)
        .finally(() => {
          starting = false
        })
    }
    tick()
    return () => {
      window.clearTimeout(timer)
      el.pause()
    }
  }, [active, at, ends, sound, hold])

  const showing = active && (phase === 'wait' || phase === 'play')
  return (
    <div className={'app-film' + (hard ? ' hard' : '') + (showing ? ' on' : '')} aria-hidden={!showing}>
      <video ref={v} src={src} preload="auto" playsInline />
      {showing && <div className="app-sr" role="status">A film is playing.</div>}
      {showing && blocked && (
        <button
          type="button"
          className="r4-btn app-filmsound"
          onClick={() => {
            const el = v.current
            if (el) {
              el.muted = false
              void el.play().catch(() => undefined)
            }
            setBlocked(false)
          }}
        >
          Turn the sound on
        </button>
      )}
    </div>
  )
}

/**
 * A laptop while a film plays on the TV: a player's shows the opening's waiting loop until it ends, and the GM's keeps working.
 */
export function LaptopFilm() {
  const film = useGame((s) => s.view?.stage.film)
  const role = useGame((s) => s.view?.me.role)
  const shown = useLingering(film)
  if (!shown || role !== 'player') return null
  return <LoopScreen key={shown.at} film={shown} live={!!film} />
}

/**
 * The TV's Burn films. It loads all of them ahead (they're small), so a Burn starts at once. Unlike a cutscene, a Burn
 * never takes a laptop over: every laptop stays on the game, and the map and the crew rail show who is burning (BurnMark).
 */
export function BurnFilms() {
  const crew = useGame((s) => s.view?.crew)
  const burn = useGame((s) => s.view?.stage.burn)
  const preview = useGame((s) => s.preview)
  const key = (crew ?? []).flatMap((c) => c.burn?.cuts.flatMap((x) => x.src ?? []) ?? []).join('|')
  const srcs = useMemo(() => (key ? [...new Set(key.split('|'))] : []), [key])
  return (
    <>
      {srcs.map((src) => (
        <FilmPlayer key={src} src={src} film={burn?.src === src ? burn : null} sound={!preview} hard hold />
      ))}
    </>
  )
}

function LoopScreen({ film, live }: { film: FilmView; live: boolean }) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setOver(true), Math.max(0, film.ends * 1000 - serverClock.now()))
    return () => window.clearTimeout(t)
  }, [film.ends])
  const up = live && !over
  return (
    <div className={'app-film' + (up ? ' on' : '')} aria-hidden={!up}>
      {film.loop && film.still && <LaptopLoop loop={film.loop} still={film.still} />}
      {up && (
        <div className="app-sr" role="status">
          A film is playing on the TV.
        </div>
      )}
    </div>
  )
}
