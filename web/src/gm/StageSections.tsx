import { useEffect, useState } from 'react'
import { serverClock } from '../net/clock'
import { gmRun } from '../store/game'
import type { Camera, CueView, Setup, View } from '../types'

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

const WHERE: Record<Setup, string> = { tv: 'on the TV', notv: 'on every laptop', online: 'on every laptop' }

/**
 * Round 12's Cutscenes section (board R12TabCutscenes): the cue list in the order you'll use them. Play asks
 * twice, because a film can't be stopped once it starts. The cue sets the map behind the film.
 */
export function CutscenesSection({ view }: { view: View }) {
  const { film, setup } = view.stage
  const cues = view.stage.cues ?? []
  const [armed, setArmed] = useState<string | null>(null)
  const now = serverClock.now() / 1000
  const busy = !!film && now < film.ends
  useTick(busy)
  const line = busy
    ? setup === 'tv'
      ? 'A film is playing on the TV, and the laptops are dark until it ends.'
      : setup === 'notv'
        ? 'A film is playing on every laptop, muted, with the sound on yours.'
        : 'A film is playing on every laptop, with its sound.'
    : "Play asks twice, because a film can't be stopped once it starts."

  const play = async (q: CueView) => {
    setArmed(null)
    await gmRun('gm.film.play', { cue: q.id })
  }

  return (
    <section className="r12-wide" aria-label="Cutscenes">
      <div className="r10-h">Cutscenes</div>
      <div className="r10-hint" aria-live="polite">
        In the order you'll use them. {line}
      </div>
      <div className="r5-rows">
        {cues.map((q) => {
          const playing = busy && film?.cue === q.id
          const el = playing && film ? Math.max(0, now - film.at) : 0
          const len = q.length ?? 0
          const tag = !q.ready ? 'NOT MADE YET' : q.played && !playing ? 'PLAYED' : ''
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
                      {now < film.at ? `Starting ${WHERE[setup]}…` : `Playing ${WHERE[setup]} · ${mss(el)} of ${mss(len)}`}
                    </span>
                  </>
                )}
              </div>
              <div className="r12-cact">
                {tag && <span className="r12-tag">{tag}</span>}
                {q.ready && !playing && armed !== q.id && (
                  <button type="button" className="r10-btn" disabled={busy} onClick={() => setArmed(q.id)}>
                    {q.played ? 'Play again' : 'Play'}
                  </button>
                )}
                {q.ready && armed === q.id && !busy && (
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
    </section>
  )
}

const SETUPS: [Setup, string][] = [
  ['tv', 'At the table, with a TV'],
  ['notv', 'At the table, no TV'],
  ['online', 'Online'],
]
const SETUP_LINE: Record<Setup, string> = {
  tv: 'Films and all the sound play on the TV. Laptops go dark during a cutscene, so everyone looks up; a Burn leaves them on the game.',
  notv: 'Laptops play films muted and in sync, and the sound comes from your laptop.',
  online: 'Every laptop plays films and sound in sync, since everyone is in a different room.',
}
const CAMS: [Camera, string][] = [
  ['crew', 'Whole crew'],
  ['follow', 'Follow one'],
  ['roller', 'Whoever rolls'],
]

/**
 * Round 12's TV section (board R12TabTV): whether the TV is connected, where you're playing, the TV's camera,
 * and what the TV shows right now (the TV's own screen, small and silent).
 */
export function TvSection({ view }: { view: View }) {
  const { setup, camera, follow, tv, film } = view.stage
  const busy = !!film && serverClock.now() / 1000 < film.ends
  useTick(busy)
  const followed = view.crew.find((c) => c.id === follow)
  const camLine =
    camera === 'crew'
      ? 'Keeps every crew member on the map in frame.'
      : camera === 'follow'
        ? `Follows ${followed?.short ?? 'one of the crew'}.`
        : 'Shows the whole crew, cuts to whoever rolls, then comes back.'
  return (
    <section aria-label="The TV">
      <div className="r10-h">The TV</div>
      <div className="r12-tvgrid">
        <div className="r12-tvcol">
          {setup !== 'tv' ? (
            <div className="r12-status r10-dimtxt">No TV this session.</div>
          ) : tv ? (
            <div className="r12-status">
              <span className="r12-dot" aria-hidden="true" />
              The TV is connected.
            </div>
          ) : (
            <div className="r12-status r10-dimtxt">No TV is connected. On the TV, open the app and pick "This screen is the TV".</div>
          )}
          <div className="r5-sec" style={{ marginTop: 8 }}>
            Where you're playing
          </div>
          <div className="r12-seg3" role="group" aria-label="Where you're playing">
            {SETUPS.map(([id, name]) => (
              <button key={id} type="button" className={setup === id ? 'on' : ''} aria-pressed={setup === id} disabled={busy} onClick={() => void gmRun('gm.stage.setup', { setup: id })}>
                {name}
              </button>
            ))}
          </div>
          <div className="r10-hint">{busy ? 'A film is playing: change this once it ends.' : SETUP_LINE[setup]}</div>
          <div className="r5-sec" style={{ marginTop: 12 }}>
            The TV's camera
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
        </div>
        <div className="r12-tvcol">
          <span className="r5-sec">On the TV now</span>
          <div className="r12-tvprev">
            <iframe src="/?as=stage" title="What the TV shows now" tabIndex={-1} aria-hidden="true" />
          </div>
          <div className="r10-hint">The TV gets only what everyone may see: the party's map, no pockets, nothing hidden.</div>
        </div>
      </div>
    </section>
  )
}
