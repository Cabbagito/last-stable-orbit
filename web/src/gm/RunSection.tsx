import { useEffect, useState } from 'react'
import { serverClock } from '../net/clock'
import { gmRun, useGame } from '../store/game'
import type { CueView, PresetCard, RunStepView, View } from '../types'
import { StationButtons } from './MoodBar'
import { EventsSection } from './EventsSection'
import { OpeningRow, TvSection, filmOn, useTick } from './StageSections'

const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * GM › Run (the UI review canvas, "Round 4: run sheet"): every film and scene of the campaign in one list, in the
 * order it's played (content/runsheet.yaml), in place of the Acts page and On screen's cutscene list. "You are here"
 * is the row last pressed and Next is the one under it, but it only suggests: every row works at any time. A scene
 * asks before it loads, because it moves everyone. A film asks too, because it can't be stopped, and waits for the TV.
 * The opening keeps its own row and its hold: players wait on their Codex page until its film ends.
 */
export function RunSection({ view }: { view: View }) {
  const { film, tv, run } = view.stage
  const cues = Object.fromEntries((view.stage.cues ?? []).map((q) => [q.id, q]))
  const presets = Object.fromEntries((view.presets ?? []).map((p) => [p.id, p]))
  const [armed, setArmed] = useState<string | null>(null)
  const held = !!view.stage.opening
  const busy = held || filmOn(view.stage)
  useTick(busy)
  useEffect(() => setArmed(null), [run?.at, busy])
  if (!run) return null
  const steps = run.acts.flatMap((a) => a.steps)
  const at = steps.findIndex((s) => s.id === run.at)
  const next = steps[at + 1] ?? null // with nothing pressed yet, the first row
  const line = held ? 'The films wait until the opening has ended.' : busy ? 'A film is on the TV. The laptops are dark until it ends.' : tv ? '' : 'No TV, so Play waits for it.'

  const go = async (s: RunStepView) => {
    setArmed(null)
    if (s.kind === 'film') return void (await gmRun('gm.film.play', { cue: s.ref }))
    const ack = await gmRun('gm.world.load_preset', { preset: s.ref, scene: true })
    if (!ack.ok) return
    useGame.setState({ gmMap: null }) // the Scene goes to wherever the party now is
    location.hash = 'scene'
  }
  /** The buttons for a row, the same in the list and in the Next bar. */
  const act = (s: RunStepView) => {
    const q = s.kind === 'film' ? cues[s.ref] : undefined
    if (s.kind === 'film' && !q?.ready) return <span className="r12-tag">NOT MADE YET</span>
    if (s.kind === 'film' && busy && film?.cue === s.ref) return null
    const off = s.kind === 'film' && (busy || !tv)
    if (armed === s.id && !off)
      return (
        <>
          <button type="button" className="r12-go" title={s.kind === 'scene' ? 'Moves everyone, places the NPCs, sets every map’s mood, and ends any fight. HP, Entropy, pockets and the Codex stay as they are.' : "It can't be stopped once it starts."} onClick={() => void go(s)}>
            {s.kind === 'film' ? 'Play it now' : 'Load it'}
          </button>
          <button type="button" className="r10-btn" onClick={() => setArmed(null)}>
            Cancel
          </button>
        </>
      )
    return (
      <button type="button" className={'r10-btn' + (next?.id === s.id ? ' gx-nextbtn' : '')} disabled={off} onClick={() => setArmed(s.id)}>
        {s.kind === 'film' ? 'Play' : 'Load'}
      </button>
    )
  }
  const nextCue = next?.kind === 'film' ? cues[next.ref] : undefined
  const nextScene = next?.kind === 'scene' ? presets[next.ref] : undefined
  const game = view.stage.opening_film

  return (
    <div className="gx-show">
      <section className="gx-cues gx-run" aria-label="Run sheet">
        {next && (
          <div className="gx-next" role="group" aria-label="Next">
            {next.ref === 'opening' && next.kind === 'film' ? (
              <>
                {game && <img src={game.still} alt="" className="r12-cthumb" />}
                <div className="r12-cmeta">
                  <span className="r5-sec gx-nextk">Next · film</span>
                  <span className="gx-nextn">{game?.name ?? 'The opening'}</span>
                  <span className="r10-dimtxt">Hold the players from its row below, then Play.</span>
                </div>
              </>
            ) : (
              <>
                {(nextCue?.still ?? nextScene?.card) && <img src={(nextCue?.still ?? nextScene?.card)!} alt="" className="r12-cthumb" />}
                <div className="r12-cmeta">
                  <span className="r5-sec gx-nextk">Next · {next.kind}</span>
                  <span className="gx-nextn">{nextCue?.name ?? nextScene?.name}</span>
                  <span className="r10-dimtxt">{nextCue ? filmLine(nextCue, presets) : nextScene?.blurb}</span>
                </div>
                <div className="r12-cact">{act(next)}</div>
              </>
            )}
          </div>
        )}
        {line && (
          <div className="r10-hint" aria-live="polite">
            {line}
          </div>
        )}
        {run.acts.map((a) => (
          <div key={a.act} role="group" aria-label={a.act}>
            <div className="gx-sh">
              <span className="r5-sec">{a.act}</span>
            </div>
            <div className="r5-rows">
              {a.steps.map((s) => {
                const here = run.at === s.id
                const isNext = next?.id === s.id
                const done = at >= 0 && steps.indexOf(s) < at
                const mark = (
                  <>
                    {here && <span className="r12-tag gx-here">YOU ARE HERE</span>}
                    {isNext && <span className="r12-tag gx-nexttag">NEXT</span>}
                  </>
                )
                if (s.kind === 'film' && s.ref === 'opening') return <OpeningRow key={s.id} view={view} bare mark={mark} className={(here ? ' gx-rhere' : '') + (isNext ? ' gx-rnext' : '') + (done ? ' gx-rdone' : '')} />
                const q = cues[s.ref]
                const p = presets[s.ref]
                const playing = s.kind === 'film' && busy && film?.cue === s.ref
                const now = serverClock.now() / 1000
                const el = playing && film ? Math.max(0, now - film.at) : 0
                const len = q?.length ?? 0
                const still = s.kind === 'film' ? q?.still : p?.card
                return (
                  <div key={s.id} className={'r5-row r12-cue' + (playing ? ' on' : '') + (s.kind === 'film' && !q?.ready ? ' off' : '') + (here ? ' gx-rhere' : '') + (isNext ? ' gx-rnext' : '') + (done ? ' gx-rdone' : '')}>
                    {still ? <img src={still} alt="" className="r12-cthumb" /> : <span className="r12-cthumb r12-none">NOT MADE YET</span>}
                    <span className={'gx-kind ' + s.kind}>{s.kind === 'film' ? 'FILM' : 'SCENE'}</span>
                    <div className="r12-cmeta">
                      <span className="gx-cnamerow">
                        <span className="r12-cname">{s.kind === 'film' ? q?.name : p?.name}</span>
                        {q?.then && <span className="r12-tag gx-link">FILM + SCENE</span>}
                        {mark}
                      </span>
                      <span className="r10-dimtxt">{s.kind === 'film' ? q && filmLine(q, presets) : p?.blurb}</span>
                      {playing && film && (
                        <>
                          <span className="r12-prog" role="progressbar" aria-label={`${q?.name}, playing`} aria-valuemin={0} aria-valuemax={Math.round(len)} aria-valuenow={Math.round(el)}>
                            <span style={{ width: `${len ? Math.min(100, (el / len) * 100) : 0}%` }} />
                          </span>
                          <span className="r12-ptime">{now < film.at ? 'Starting on the TV…' : `Playing on the TV · ${mss(el)} of ${mss(len)}`}</span>
                        </>
                      )}
                    </div>
                    <div className="r12-cact">{act(s)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </section>
      <div className="gx-showcol">
        <RunSide view={view} />
      </div>
    </div>
  )
}

/** "40 s, session 1, before the pitch. Ends on…": a film's one line, and the scene it brings. */
function filmLine(q: CueView, presets: Record<string, PresetCard>) {
  return [q.sub && q.sub[0].toUpperCase() + q.sub.slice(1) + '.', q.ends, q.then && !q.ends.includes(presets[q.then]?.name ?? '\0') ? `Then ${presets[q.then]?.name} loads.` : ''].filter(Boolean).join(' ')
}

/** Beside the sheet: the TV and events as they were on On screen, and the station's one control. */
function RunSide({ view }: { view: View }) {
  const station = view.station_mood
  return (
    <>
      <TvSection view={view} />
      <EventsSection view={view} />
      {station && (
        <section className="gx-tv" aria-label="Station">
          <div className="gx-h2">Station</div>
          <div className="r10-mood gx-mmood" role="group" aria-label="The station's state">
            <StationButtons station={station} />
          </div>
        </section>
      )}
    </>
  )
}
