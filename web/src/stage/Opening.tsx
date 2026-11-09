import { useEffect, useRef, useState } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { useGame } from '../store/game'
import type { OpeningView } from '../types'
import { BlackHole } from './BlackHole'
import { JoinCard } from './JoinCard'
import { OpeningAudio, OpeningScreen, type OpeningTimes } from './opening_player'

const FADE = 900 // ms the TV keeps its pictures up while they fade back to the map (.app-film's transition)

const timesOf = (o: OpeningView | null): OpeningTimes => ({
  loopStartedAt: o ? o.loop_at * 1000 : null,
  filmStartAt: o?.film_at != null ? o.film_at * 1000 : null,
})

/**
 * The TV during the opening: the waiting loop until the GM presses Play, then the film. Its pictures and sound are
 * worked out from the server's times alone, so a TV that reloads jumps to the right moment. `sound` is null until the
 * TV's start click, and always on the GM's small preview of it.
 */
export function TvOpening({ sound }: { sound: RollSound | null }) {
  const opening = useGame((s) => s.view?.stage.opening ?? null)
  const join = useGame((s) => s.view?.stage.join)
  const [kept, setKept] = useState(opening)
  const [problem, setProblem] = useState('')
  const audio = useRef<OpeningAudio | null>(null)
  const latest = useRef(timesOf(opening))
  latest.current = timesOf(opening)

  useEffect(() => {
    if (opening) {
      setKept(opening)
      return
    }
    const t = window.setTimeout(() => setKept(null), FADE)
    return () => window.clearTimeout(t)
  }, [opening])

  const shown = opening ?? kept
  const url = shown?.audio
  const ctx = sound?.context
  useEffect(() => {
    if (!ctx || !url) return
    const a = new OpeningAudio({ url, now: serverClock.now, ctx })
    let live = true
    a.load()
      .then(() => {
        if (!live) return
        audio.current = a
        a.apply(latest.current)
      })
      .catch((e: Error) => {
        if (live) setProblem(e.message)
      })
    return () => {
      live = false
      audio.current = null
      a.stop()
      a.out.disconnect()
    }
  }, [ctx, url])

  const loopAt = opening?.loop_at
  const filmAt = opening?.film_at
  useEffect(() => {
    audio.current?.apply(latest.current)
  }, [loopAt, filmAt])

  if (!shown) return null
  return (
    <div className={'app-film app-opening' + (opening ? ' on' : '')} aria-hidden={!opening}>
      <Pictures opening={shown} />
      {opening && <div className="app-sr" role="status">The opening is on the TV.</div>}
      {opening && join?.show && (
        <aside className="app-tvjoin" aria-label="How to join the game">
          <JoinCard join={join} />
        </aside>
      )}
      {problem && (
        <div className="app-openingerr" role="alert">
          The opening's sound didn't load: {problem}
        </div>
      )}
    </div>
  )
}

function Pictures({ opening }: { opening: OpeningView }) {
  const loop = useRef<HTMLVideoElement>(null)
  const film = useRef<HTMLVideoElement>(null)
  const screen = useRef<OpeningScreen | null>(null)
  useEffect(() => {
    const s = new OpeningScreen({ loopVideo: loop.current!, filmVideo: film.current!, now: serverClock.now })
    screen.current = s
    return () => {
      screen.current = null
      s.destroy()
    }
  }, [])
  useEffect(() => {
    screen.current?.apply(timesOf(opening))
  }, [opening])
  return (
    <>
      <video ref={loop} src={opening.loop} poster={opening.still} playsInline muted />
      <video ref={film} src={opening.film} playsInline muted />
    </>
  )
}

/**
 * A player's laptop while the GM holds them on the opening: the black hole and nothing else, until the film ends and
 * it fades to the game. Black too until the first view arrives, so nothing of the game flashes up after the login.
 */
export function LaptopHold() {
  const view = useGame((s) => s.view)
  const held = !!view?.stage.held
  const wasHeld = useRef(false)
  useEffect(() => {
    if (held) wasHeld.current = true
  }, [held])
  const up = held || !view
  return (
    <div className={'app-film app-held' + (view && !held && !wasHeld.current ? ' hard' : '') + (up ? ' on' : '')} aria-hidden={!up}>
      {held && <BlackHole />}
      {held && <div className="app-sr" role="status">The opening is on the TV.</div>}
    </div>
  )
}
