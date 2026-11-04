import { useEffect, useRef, useState } from 'react'
import { serverClock } from '../net/clock'
import { useGame } from '../store/game'
import type { FilmView } from '../types'
import { BlackHole } from './BlackHole'

const DRIFT = 0.3 // seconds out of step before a playing film jumps back into step
const TICK = 100 // ms; a timer, not animation frames, so a background tab keeps time too

type Phase = 'idle' | 'wait' | 'play' | 'over'

/**
 * One film, in step with every other screen that plays it: it starts at the server moment `film.at`. A screen
 * that's late (it fetched the file slowly, or joined mid-film) jumps to where everyone else is. Full screen,
 * with no controls; it fades back to the map at the end. Mounted ahead with `film` null, it just fetches.
 */
export function FilmPlayer({ src, film, sound }: { src: string; film: FilmView | null | undefined; sound: boolean }) {
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
    let timer = 0
    const tick = () => {
      const now = serverClock.now() / 1000
      const pos = now - at
      if (now >= ends || (ran && el.ended)) {
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
      if (!el.paused) {
        if (Math.abs(el.currentTime - pos) > DRIFT) el.currentTime = pos
        return
      }
      if (starting) return
      starting = true
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
  }, [active, at, ends, sound])

  const showing = active && (phase === 'wait' || phase === 'play')
  return (
    <div className={'app-film' + (showing ? ' on' : '')} aria-hidden={!showing}>
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
 * A laptop while a film plays. With a TV the film is on the TV: a player's laptop shows the black hole until it
 * ends, and the GM's keeps working. Without a TV, or online, every laptop plays it (only the sound differs).
 */
export function LaptopFilm() {
  const film = useGame((s) => s.view?.stage.film)
  const role = useGame((s) => s.view?.me.role)
  const preview = useGame((s) => s.preview)
  if (!film) return null
  if (film.src) return <FilmPlayer key={film.at} src={film.src} film={film} sound={!!film.sound && !preview} />
  if (role === 'player') return <HoleScreen key={film.at} ends={film.ends} />
  return null
}

function HoleScreen({ ends }: { ends: number }) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setOver(true), Math.max(0, ends * 1000 - serverClock.now()))
    return () => window.clearTimeout(t)
  }, [ends])
  return (
    <div className={'app-film' + (over ? '' : ' on')} aria-hidden={over}>
      {!over && <BlackHole />}
      {!over && (
        <div className="app-sr" role="status">
          A film is playing on the TV.
        </div>
      )}
    </div>
  )
}
