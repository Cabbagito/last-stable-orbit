import { useEffect, useState, type ReactNode } from 'react'
import { serverClock } from '../net/clock'
import { bareUrl } from '../stage/JoinCard'
import { gmRun } from '../store/game'
import type { Camera, StageView, View } from '../types'

const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Re-render every half second while `on`: a film's progress. */
export function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set((n) => n + 1), 500)
    return () => window.clearInterval(t)
  }, [on])
}

/** A film is on the TV, a cue or the opening's: it can't be stopped, and the TV can't be changed while it plays. */
export function filmOn({ film, opening }: StageView) {
  const now = serverClock.now() / 1000
  return (!!film && now < film.ends) || (!!opening?.ends && now < opening.ends)
}

/**
 * The opening, the first row of Cutscenes. Held, the TV loops the stars and the music and players' laptops show only
 * that. Play asks twice, and when the film ends the server lets everyone in and turns this off by itself. Reset the
 * game is here rather than in the film, so the intro can be shown without losing the game.
 */
export function OpeningRow({ view, bare, mark, className = '' }: { view: View; bare?: boolean; mark?: ReactNode; className?: string }) {
  const { opening, tv, opening_film: game } = view.stage
  const [asking, setAsking] = useState<'play' | 'reset' | null>(null)
  const [wasReset, setWasReset] = useState(false)
  const on = !!opening
  const started = opening?.film_at != null
  useTick(started)
  useEffect(() => {
    setAsking(null)
    setWasReset(false)
  }, [on])
  if (!game) return null
  const now = serverClock.now() / 1000
  const filmAt = opening?.film_at ?? now
  const el = Math.max(0, now - filmAt)
  const held = on && !started
  const ask = held ? asking : null
  const sub = !on
    ? game.sub
    : started
      ? 'Everyone goes into the game when it ends.'
      : ask === 'play'
        ? "It can't be stopped once it starts."
        : ask === 'reset'
          ? 'Puts every position, mood, HP, Entropy, pocket and the Codex back to the start.'
          : wasReset
            ? 'Everything is back to the start.'
            : tv
              ? 'Their laptops show the stars, silent, until the film ends.'
              : 'Their laptops show the stars. Play waits for the TV.'
  const set = (value: boolean) => void gmRun('gm.opening.set', { on: value })
  const go = (kind: string, after?: () => void) => {
    setAsking(null)
    void gmRun(kind, {}).then((ack) => ack.ok && after?.())
  }
  const row = (
    <div className={'r5-row r12-cue' + (on ? ' on' : '') + className}>
      <img src={game.still} alt="" className="r12-cthumb" />
      {bare && <span className="gx-kind film">FILM</span>}
      <div className="r12-cmeta">
        <span className="gx-cnamerow">
          <span className="r12-cname">{game.name}</span>
          {held && <span className="r12-tag gx-amber">PLAYERS HELD</span>}
          {mark}
        </span>
        <span className="r10-dimtxt" aria-live="polite">
          {sub}
        </span>
        {started && (
          <>
            <span className="r12-prog" role="progressbar" aria-label="The opening, playing" aria-valuemin={0} aria-valuemax={Math.round(game.length)} aria-valuenow={Math.round(el)}>
              <span style={{ width: `${Math.min(100, (el / game.length) * 100)}%` }} />
            </span>
            <span className="r12-ptime">{now < filmAt ? 'Starting on the TV…' : `Playing on the TV · ${mss(el)} of ${mss(game.length)}`}</span>
          </>
        )}
      </div>
      <div className="r12-cact">
        {!on && (
          <button type="button" className="r10-btn" disabled={filmOn(view.stage)} onClick={() => set(true)}>
            Hold players
          </button>
        )}
        {held && !ask && (
          <>
            <button type="button" className="r10-btn" onClick={() => setAsking('reset')}>
              Reset the game
            </button>
            <button type="button" className="r10-btn" onClick={() => set(false)}>
              Let them in
            </button>
            <button type="button" className="r10-btn" disabled={!tv} onClick={() => setAsking('play')}>
              Play
            </button>
          </>
        )}
        {ask === 'play' && (
          <>
            <button type="button" className="r12-go" disabled={!tv} onClick={() => go('gm.opening.play')}>
              Play it now
            </button>
            <button type="button" className="r10-btn" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </>
        )}
        {ask === 'reset' && (
          <>
            <button type="button" className="r12-go" onClick={() => go('gm.opening.reset', () => setWasReset(true))}>
              Reset it
            </button>
            <button type="button" className="r10-btn" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
  if (bare) return row // a row of the Run sheet, under its act
  return (
    <div role="group" aria-label="The opening">
      <div className="gx-sh">
        <span className="r5-sec">Opening</span>
      </div>
      <div className="r5-rows">{row}</div>
    </div>
  )
}

const CAMS: [Camera, string][] = [
  ['crew', 'Whole crew'],
  ['follow', 'Follow one'],
  ['roller', 'Whoever rolls'],
]

/**
 * The TV: whether it's connected, what it shows right now (its own screen, small and silent), its camera, and the
 * link and wifi on it.
 */
export function TvSection({ view }: { view: View }) {
  const { camera, follow, tv, join } = view.stage
  const busy = filmOn(view.stage)
  useTick(busy)
  const followed = view.crew.find((c) => c.id === follow)
  const camLine =
    camera === 'crew'
      ? 'Keeps every crew member on the map in frame.'
      : camera === 'follow'
        ? `Follows ${followed?.short ?? (follow && view.tokens[follow]?.name) ?? 'one of the crew'}.`
        : 'Shows the whole crew, cuts to whoever rolls, then comes back.'
  return (
    <section className="gx-tv" aria-label="The TV">
      <div className="gx-tvhead">
        <div className="gx-h2">The TV</div>
        <span className={'gx-tvstat' + (tv ? '' : ' none')} role="status">
          <i aria-hidden="true" />
          {tv ? 'Connected' : 'No TV'}
        </span>
      </div>
      <div className="r12-tvprev gx-tvprev">
        {tv ? (
          <iframe src="/?as=stage" title="What the TV shows now" tabIndex={-1} aria-hidden="true" />
        ) : (
          <div className="gx-tvempty">
            <b>No TV yet</b>
            <span className="r10-hint">On the TV, open the app and click the screen icon in the top-right corner.</span>
          </div>
        )}
      </div>
      <div className="r5-sec" style={{ marginTop: 4 }}>
        Camera
      </div>
      <div className="r12-seg3" role="group" aria-label="The TV's camera">
        {CAMS.map(([id, name]) => (
          <button key={id} type="button" className={camera === id ? 'on' : ''} aria-pressed={camera === id} disabled={busy} onClick={() => void gmRun('gm.stage.camera', { camera: id })}>
            {name}
          </button>
        ))}
      </div>
      {camera === 'follow' && (
        <div className="r10-faces" role="group" aria-label="Who the TV follows">
          {view.crew.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'r10-face' + (follow === c.id ? ' on' : '')}
              aria-pressed={follow === c.id}
              aria-label={`Follow ${c.short}`}
              title={c.short}
              disabled={busy}
              onClick={() => void gmRun('gm.stage.camera', { camera: 'follow', follow: c.id })}
            >
              <img src={c.portrait} alt="" className="r3-px" />
            </button>
          ))}
        </div>
      )}
      <div className="r10-hint">{camLine}</div>
      {join && (
        <button type="button" role="switch" aria-checked={join.show} className={'gx-sw' + (join.show ? ' on' : '')} disabled={busy} onClick={() => void gmRun('gm.stage.join', { show: !join.show })}>
          <span className="gx-swt">
            <span className="gx-swn">Link and wifi on the TV</span>
            <span className="gx-swv">{[bareUrl(join.url), join.ssid].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="gx-swtrack" aria-hidden="true">
            <span />
          </span>
        </button>
      )}
    </section>
  )
}
