import { useEffect, useRef, useState } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { useGame } from '../store/game'
import type { OpeningView } from '../types'
import { JoinCard } from './JoinCard'
import { OpeningAudio, OpeningScreen, type OpeningTimes } from './opening_player'
import { useAwake } from './useAwake'

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
 * A player's laptop while the GM holds them on the opening: the TV's waiting loop, silent, until the film ends and it
 * fades to the game. Black until the first view arrives, so nothing of the game flashes up after the login. Moving the
 * mouse shows a way out, for a player who picked the wrong character; the GM's view of a player has none.
 */
export function LaptopHold({ onLogout }: { onLogout?: () => void }) {
  const view = useGame((s) => s.view)
  const held = view?.stage.held ?? null
  const [kept, setKept] = useState(held)
  useEffect(() => {
    if (held) {
      setKept(held)
      return
    }
    const t = window.setTimeout(() => setKept(null), FADE)
    return () => window.clearTimeout(t)
  }, [held])
  const awake = useAwake()
  const shown = held ?? kept
  const up = !!held || !view
  return (
    <div className={'app-film app-held' + (view && !shown ? ' hard' : '') + (up ? ' on' : '') + (awake ? ' awake' : '')} aria-hidden={!up}>
      {shown && <HoldLoop loop={shown.loop} still={shown.still} />}
      {held && <div className="app-sr" role="status">The opening is on the TV.</div>}
      {held && onLogout && (
        <button type="button" className="r4-btn app-heldexit" onClick={onLogout}>
          Change character
        </button>
      )}
    </div>
  )
}

function HoldLoop({ loop, still }: { loop: string; still: string }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = v.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return // the still, for those who asked for no motion
    el.muted = true // laptops are silent, and browsers only autoplay a muted video
    el.play().catch(() => undefined)
  }, [])
  return <video ref={v} src={loop} poster={still} loop muted playsInline preload="auto" />
}
