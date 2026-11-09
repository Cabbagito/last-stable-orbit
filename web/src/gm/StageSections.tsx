import { useEffect, useState } from 'react'
import { serverClock } from '../net/clock'
import { bareUrl } from '../stage/JoinCard'
import { gmRun } from '../store/game'
import type { Camera, CueView, StageView, View } from '../types'

const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Re-render every half second while `on`: a film's progress. */
function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set((n) => n + 1), 500)
    return () => window.clearInterval(t)
  }, [on])
}

/** A film is on the TV, a cue or the opening's: it can't be stopped, and the TV can't be changed while it plays. */
function filmOn({ film, opening }: StageView) {
  const now = serverClock.now() / 1000
  return (!!film && now < film.ends) || (!!opening?.ends && now < opening.ends)
}

/**
 * The opening, the first row of Cutscenes. Held, the TV loops the stars and the music and players' laptops show only
 * that. Play asks twice, and when the film ends the server lets everyone in and turns this off by itself. Reset the
 * game is here rather than in the film, so the intro can be shown without losing the game.
 */
function OpeningRow({ view }: { view: View }) {
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
  return (
    <div role="group" aria-label="The opening">
      <div className="gx-sh">
        <span className="r5-sec">Opening</span>
      </div>
      <div className="r5-rows">
        <div className={'r5-row r12-cue' + (on ? ' on' : '')}>
          <img src={game.still} alt="" className="r12-cthumb" />
          <div className="r12-cmeta">
            <span className="gx-cnamerow">
              <span className="r12-cname">{game.name}</span>
              {held && <span className="r12-tag gx-amber">PLAYERS HELD</span>}
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
      </div>
    </div>
  )
}

/**
 * Round 12's Cutscenes section (board R12TabCutscenes): the opening, then the cue list in the order you'll use them.
 * Play asks twice, because a film can't be stopped once it starts, and waits for the TV, the only screen that plays
 * films. The cue sets the map behind the film.
 */
export function CutscenesSection({ view }: { view: View }) {
  const { film, tv } = view.stage
  const cues = view.stage.cues ?? []
  const [armed, setArmed] = useState<string | null>(null)
  const now = serverClock.now() / 1000
  const held = !!view.stage.opening
  const busy = held || filmOn(view.stage)
  useTick(busy)
  const line = held ? 'The films wait until the opening has ended.' : busy ? 'A film is on the TV. The laptops are dark until it ends.' : tv ? '' : 'No TV, so Play waits for it.'

  const play = async (q: CueView) => {
    setArmed(null)
    await gmRun('gm.film.play', { cue: q.id })
  }

  return (
    <section className="gx-cues" aria-label="Cutscenes">
      <div className="gx-h2row">
        <div className="gx-h2">Cutscenes</div>
        {line && (
          <div className="r10-hint" aria-live="polite">
            {line}
          </div>
        )}
      </div>
      <OpeningRow view={view} />
      {[...new Set(cues.map((q) => q.act))].map((act) => (
        <div key={act} role="group" aria-label={act}>
          <div className="gx-sh">
            <span className="r5-sec">{act}</span>
          </div>
          <div className="r5-rows">
            {cues.filter((q) => q.act === act).map((q) => {
              const playing = busy && film?.cue === q.id
              const el = playing && film ? Math.max(0, now - film.at) : 0
              const len = q.length ?? 0
              return (
                <div key={q.id} className={'r5-row r12-cue' + (playing ? ' on' : '') + (q.ready ? '' : ' off')}>
                  {q.still ? <img src={q.still} alt="" className="r12-cthumb" /> : <span className="r12-cthumb r12-none">NOT MADE YET</span>}
                  <div className="r12-cmeta">
                    <span className="r12-cname">{q.name}</span>
                    <span className="r10-dimtxt">{q.sub}</span>
                    {q.ends && <span className="r12-cend">{q.ends}</span>}
                    {playing && film && (
                      <>
                        <span className="r12-prog" role="progressbar" aria-label={`${q.name}, playing`} aria-valuemin={0} aria-valuemax={Math.round(len)} aria-valuenow={Math.round(el)}>
                          <span style={{ width: `${len ? Math.min(100, (el / len) * 100) : 0}%` }} />
                        </span>
                        <span className="r12-ptime">
                          {now < film.at ? 'Starting on the TV…' : `Playing on the TV · ${mss(el)} of ${mss(len)}`}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="r12-cact">
                    {!q.ready && <span className="r12-tag">NOT MADE YET</span>}
                    {q.ready && !playing && armed !== q.id && (
                      <button type="button" className="r10-btn" disabled={busy || !tv} onClick={() => setArmed(q.id)}>
                        Play
                      </button>
                    )}
                    {q.ready && armed === q.id && !busy && tv && (
                      <>
                        <button type="button" className="r12-go" onClick={() => void play(q)}>
                          Play it now
                        </button>
                        <button type="button" className="r10-btn" onClick={() => setArmed(null)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
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
        ? `Follows ${followed?.short ?? 'one of the crew'}.`
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
            <span className="r10-hint">On the TV, open the app and pick "This screen is the TV".</span>
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
