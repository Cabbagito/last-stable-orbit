import { useEffect, useState } from 'react'
import { serverClock } from '../net/clock'
import { JoinCard } from '../stage/JoinCard'
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
 * The opening, on the Session page. On, the TV loops the stars and the music and players' laptops show only the black
 * hole. Play asks twice, and when the film ends the server lets everyone in and turns this off by itself.
 */
export function OpeningSection({ view }: { view: View }) {
  const { opening, tv, opening_film: game } = view.stage
  const [armed, setArmed] = useState(false)
  const started = opening?.film_at != null
  useTick(started)
  if (!game) return null
  const on = !!opening
  const now = serverClock.now() / 1000
  const filmAt = opening?.film_at ?? now
  const el = Math.max(0, now - filmAt)
  const line = !on
    ? 'Turn this on before anyone picks their character. Their laptops show only the stars and the station, silent, and the TV loops them with the music, until the film ends.'
    : started
      ? 'Everyone goes into the game when it ends, and this turns itself off.'
      : tv
        ? "The players are held. Set the scene, then press Play. It asks twice, because the film can't be stopped once it starts."
        : 'The players are held. No TV is connected, so Play waits for it.'
  const set = (value: boolean) => {
    setArmed(false)
    void gmRun('gm.opening.set', { on: value })
  }
  return (
    <div className="gx-opening">
      <div className="r12-seg3 app-gmjoinseg" role="group" aria-label="Hold the players on the opening">
        <button type="button" className={on ? 'on' : ''} aria-pressed={on} disabled={started || (!on && filmOn(view.stage))} onClick={() => set(true)}>
          Hold players
        </button>
        <button type="button" className={on ? '' : 'on'} aria-pressed={!on} disabled={started} onClick={() => set(false)}>
          Off
        </button>
      </div>
      <div className="r10-hint" aria-live="polite">
        {line}
      </div>
      {on && (
        <div className="r5-rows">
          <div className={'r5-row r12-cue' + (started ? ' on' : '')}>
            <img src={game.still} alt="" className="r12-cthumb" />
            <div className="r12-cmeta">
              <span className="r12-cname">{game.name}</span>
              <span className="r10-dimtxt">{game.sub}</span>
              {started && (
                <>
                  <span className="r12-prog" role="progressbar" aria-label="The opening, playing" aria-valuemin={0} aria-valuemax={Math.round(game.length)} aria-valuenow={Math.round(el)}>
                    <span style={{ width: `${Math.min(100, (el / game.length) * 100)}%` }} />
                  </span>
                  <span className="r12-ptime">{now < filmAt ? 'Starting on the TV…' : `Playing on the TV · ${mss(el)} of ${mss(game.length)}`}</span>
                </>
              )}
            </div>
            {!started && (
              <div className="r12-cact">
                {armed && tv ? (
                  <>
                    <button
                      type="button"
                      className="r12-go"
                      onClick={() => {
                        setArmed(false)
                        void gmRun('gm.opening.play', {})
                      }}
                    >
                      Play it now
                    </button>
                    <button type="button" className="r10-btn" onClick={() => setArmed(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="r10-btn" disabled={!tv} onClick={() => setArmed(true)}>
                    Play
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Round 12's Cutscenes section (board R12TabCutscenes): the cue list in the order you'll use them. Play asks
 * twice, because a film can't be stopped once it starts, and waits for the TV, the only screen that plays films.
 * The cue sets the map behind the film.
 */
export function CutscenesSection({ view }: { view: View }) {
  const { film, tv } = view.stage
  const cues = view.stage.cues ?? []
  const [armed, setArmed] = useState<string | null>(null)
  const now = serverClock.now() / 1000
  const held = !!view.stage.opening
  const busy = held || filmOn(view.stage)
  useTick(busy)
  const line = held
    ? 'The opening is on, so the films wait until it has ended.'
    : busy
      ? 'A film is playing on the TV, and the laptops are dark until it ends.'
      : tv
        ? "Play asks twice, because a film can't be stopped once it starts."
        : 'No TV is connected, so Play waits for it. On the TV, open the app and pick "This screen is the TV".'

  const play = async (q: CueView) => {
    setArmed(null)
    await gmRun('gm.film.play', { cue: q.id })
  }

  return (
    <section className="gx-cues" aria-label="Cutscenes">
      <div className="gx-h2">Cutscenes</div>
      <div className="r10-hint" aria-live="polite">
        In the order you'll use them. {line}
      </div>
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
 * The TV: whether it's connected, what it shows right now (its own screen, small and silent), and its camera.
 */
export function TvSection({ view }: { view: View }) {
  const { camera, follow, tv } = view.stage
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
      <div className="gx-h2">The TV</div>
      {tv ? (
        <div className="r12-status">
          <span className="r12-dot" aria-hidden="true" />
          The TV is connected.
        </div>
      ) : (
        <div className="r12-status r10-dimtxt">No TV is connected.</div>
      )}
      <div className="r12-tvprev gx-tvprev">
        <iframe src="/?as=stage" title="What the TV shows now" tabIndex={-1} aria-hidden="true" />
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
    </section>
  )
}

/** The join card on the TV: the wifi and the URL, until everyone's in. */
export function JoinSection({ view }: { view: View }) {
  const { join } = view.stage
  const busy = filmOn(view.stage)
  if (!join) return null
  return (
    <div className="app-gmjoin" style={{ marginTop: 0 }}>
      <div className="r12-seg3 app-gmjoinseg" role="group" aria-label="The join card on the TV">
        <button type="button" className={join.show ? 'on' : ''} aria-pressed={join.show} disabled={busy} onClick={() => void gmRun('gm.stage.join', { show: true })}>
          On the TV
        </button>
        <button type="button" className={join.show ? '' : 'on'} aria-pressed={!join.show} disabled={busy} onClick={() => void gmRun('gm.stage.join', { show: false })}>
          Hidden
        </button>
      </div>
      <div className="r10-hint">Shows the wifi password. Hide it once everyone's in.</div>
      <JoinCard join={join} />
    </div>
  )
}
