import { useEffect, useRef, useState } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { HeldCodex } from '../pages/Codex'
import { FullscreenButton } from '../shell/Header'
import { useGame } from '../store/game'
import type { OpeningView } from '../types'
import { JoinCard } from './JoinCard'
import { LaptopLoop, releaseVideo, useLingering } from './LaptopLoop'
import { OpeningAudio, OpeningScreen, type OpeningTimes } from './opening_player'
import { useAwake } from './useAwake'

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
  const shown = useLingering(opening)
  const [problem, setProblem] = useState('')
  const audio = useRef<OpeningAudio | null>(null)
  const latest = useRef(timesOf(opening))
  latest.current = timesOf(opening)

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
      {opening && join?.show && <JoinCard join={join} />}
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
    const l = loop.current!
    const f = film.current!
    const s = new OpeningScreen({ loopVideo: l, filmVideo: f, now: serverClock.now })
    screen.current = s
    return () => {
      screen.current = null
      s.destroy()
      releaseVideo(l)
      releaseVideo(f)
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
 * A player's laptop while the GM holds them on the opening: their own character's Codex page, brief first, and nothing
 * else of the game. When the GM presses Play it fades to the TV's waiting loop, silent, until the film ends and that
 * fades to the game. Black until the first view arrives, so nothing of the game flashes up after the login. On the
 * loop, moving the mouse shows full screen and a way out; the page has both in its bar. The GM's view of a player has none.
 */
export function LaptopHold({ onLogout }: { onLogout?: () => void }) {
  const view = useGame((s) => s.view)
  const held = view?.stage.held ?? null
  const shown = useLingering(held)
  const awake = useAwake()
  const own = !!view?.codex?.entries.some((e) => e.crew && e.crew.id === view.me.char)
  const page = !!held && !held.rolling && own // Play takes the page away
  const pageShown = useLingering(page ? true : null)
  const up = !!held || !view
  return (
    <div className={'app-film app-held' + (view && !shown ? ' hard' : '') + (up ? ' on' : '') + (awake ? ' awake' : '')} aria-hidden={!up}>
      {shown && <LaptopLoop loop={shown.loop} still={shown.still} />}
      {held && <div className="app-sr" role="status">{page ? 'Your page, until the opening starts.' : 'The opening is on the TV.'}</div>}
      {held && !page && onLogout && (
        <div className="app-heldbar">
          <FullscreenButton />
          <button type="button" className="r4-btn" onClick={onLogout}>
            Change character
          </button>
        </div>
      )}
      {pageShown && (
        <div className={'app-heldcx' + (page ? ' on' : '')}>
          <HeldCodex onLogout={onLogout} />
        </div>
      )}
    </div>
  )
}
