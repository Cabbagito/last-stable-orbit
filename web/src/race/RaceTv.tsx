import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { TvAudio } from '../stage/music'
import { useGame } from '../store/game'
import type { RaceTvView } from '../types'
import { drawRace, VH, VW } from './draw'
import { advance, buildTrack, clamp, lapOf, LIGHTS, newRace, ranked, type Race } from './sim'

// Bot bay racing on the TV (the canvas's Main and Final boards). Nobody presses anything here: the GM sends it, the
// players prep on their laptops, and when the last one revs the server sets the start. From then on the race is the
// seed's, run on the TV's clock from the server's start time, so a TV that reloads mid-race picks it up where it is.
// All the sound is here, and only here.

export const BOARD = { w: 1600, h: 900 }
const TAGS: Record<string, string> = { spin: 'SPIN', flip: 'FLIPPED', stall: 'STALLED', survey: 'SURVEY' }
// which sound goes with which word over a bot, and with which of the caller's lines (the prototype's POP_SND, LINE_SND)
const POP_SND: Record<string, string> = { SURGE: 'surge', 'NOODLES!': 'surge', SPIN: 'spin', CRUNCH: 'crash', HOT: 'overheat', STALLED: 'overheat', 'NOODLES...': 'overheat', FLIPPED: 'flip', CLINK: 'bottle', SURVEY: 'survey', BROKEN: 'destroyed' }
const LINE_SND: [string, string][] = [['A KIND BOOT', 'kick_up'], ['LAST LAP', 'last_lap'], ['PHOTO FINISH', 'photo_finish'], ['GUARD!', 'guard'], ['UNIT 12', 'survey'], ['SURVEY COMPLETE', 'survey']]
const LINES = { grid: 'PLACE YOUR BETS.', horn: 'SOMETHING IS PLAYING A CAR HORN.', off: "LIGHTS OUT. THEY'RE OFF!", csat2: 'CSAT-2 HAS A SURVEY FOR YOU.' }
const LATE = 0.5 // s: a cue the TV missed by more than this stays quiet (a reload doesn't replay the race's past)

type Phase = 'grid' | 'intro' | 'lights' | 'race' | 'result' | 'gone'

interface Shown {
  phase: Phase
  lap: string
  line: string
  rows: { pos: number; name: string; color: string; tag: string }[]
  lit: number
  guard: boolean
  photo: boolean
  result: { title: string; color: string } | null
}

const track = buildTrack()

function phaseOf(v: RaceTvView, r: Race, now: number): Phase {
  if (v.start === null) return 'grid'
  if (now < v.start) return v.final && now >= v.start - v.intro ? 'intro' : 'grid'
  if (!r.over) return r.t < 0 ? 'lights' : 'race'
  return now - v.start < r.wall + v.hold ? 'result' : 'gone'
}

function resultOf(v: RaceTvView, r: Race) {
  const w = ranked(r)[0]
  if (v.final) return w.csat ? { title: 'CSAT-1 RETAINS', color: '#ffffff' } : { title: 'NEW CHAMPION', color: w.color }
  return { title: w.name + ' WINS', color: w.color }
}

/** On the TV: the Bot bays, the race over them, the standings and the caller, with all of the sound. */
export function TvRace({ sound }: { sound: RollSound | null }) {
  const v = useGame((s) => (s.view?.race && 'seed' in s.view.race ? s.view.race : null))
  const box = useRef<HTMLDivElement | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const ui = useRef<HTMLCanvasElement>(null)
  const [k, setK] = useState(1)
  const [shown, setShown] = useState<Shown | null>(null)
  const ac = sound?.context ?? null
  const audio = useMemo(() => (ac ? new TvAudio(ac) : null), [ac])
  const ear = useRef<{ id: string; race: Race; lines: number; pops: WeakSet<object>; song: string; phase: Phase | ''; quiet: number; fresh: boolean } | null>(null)
  // the race: built from the seed and the grid, again whenever the grid changes before the lights (a bot gets dressed)
  const key = v ? JSON.stringify([v.id, v.seed, v.laps, v.final, v.entries]) : ''
  const race = useMemo(() => (v ? newRace(track, v.entries, v.laps, v.seed, v.final) : null), [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // fit the 1600 x 900 board to the screen, whenever it's on it
  const fitTo = useCallback((el: HTMLDivElement | null) => {
    box.current?.dispatchEvent(new Event('rc-unfit'))
    box.current = el
    if (!el) return
    const fit = () => setK(Math.min(el.clientWidth / BOARD.w, el.clientHeight / BOARD.h) || 1)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    el.addEventListener('rc-unfit', () => ro.disconnect(), { once: true })
  }, [])

  useEffect(() => () => audio?.stop(), [audio])
  useEffect(() => {
    if (audio && v) [...Object.values(v.sound.files), ...Object.values(v.sound.music).map((m) => m.src)].forEach((f) => void audio.load(f))
  }, [audio, v?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // every frame: run the race up to now, draw it, and say what just happened
  useEffect(() => {
    if (!v || !race) {
      setShown(null)
      return
    }
    const snd = v.sound
    const fx = (name: string, delay = 0) => audio && snd.files[name] && audio.play(snd.files[name], snd.volume, delay)
    // what this TV has already heard of this race, kept across re-renders; a new grid before the lights starts it over
    if (ear.current?.id !== v.id) ear.current = { id: v.id, race, lines: 0, pops: new WeakSet(), song: '', phase: '', quiet: 0, fresh: true }
    const e = ear.current
    if (e.race !== race) Object.assign(e, { race, lines: race.lines.length, pops: new WeakSet(race.pops) })
    let raf = 0
    let sig = ''
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      const now = serverClock.now() / 1000
      if (v.start !== null && now >= v.start) advance(race, now - v.start)
      const fresh = e.fresh // the first frame this TV saw of it: whatever already happened is heard as said
      e.fresh = false
      const phase = phaseOf(v, race, now)
      const wall = v.start === null ? 0 : now - v.start // real seconds since the lights came on
      const late = (t: number) => race.t - t > LATE

      // the caller's lines and the words over the bots, out loud, once each
      for (let i = e.lines; i < race.lines.length; i++) {
        const [t, text] = race.lines[i]
        if (text.startsWith('GUARD!')) e.quiet = 1 // the music cuts dead while he walks past
        if (text.startsWith("...HE'S GONE")) e.quiet = 0
        if (!fresh && !late(t)) LINE_SND.forEach(([start, name]) => text.startsWith(start) && fx(name))
      }
      e.lines = race.lines.length
      for (const p of race.pops) {
        if (e.pops.has(p)) continue
        e.pops.add(p)
        if (!fresh && !late(p.t) && POP_SND[p.word]) fx(POP_SND[p.word])
      }

      // the music, and the moments between the phases
      if (phase !== e.phase) {
        e.phase = phase
        if (phase === 'intro' && !fresh) fx('horn')
        if (phase === 'lights' && wall < LATE) fx('lights_go') // its GO lands as the race starts
        if (phase === 'result' && !fresh) {
          const w = ranked(race)[0]
          if (!v.final) fx('win')
          else if (w.csat) fx('retains')
          else {
            fx('champion', 0.8)
            fx('csat2', 4)
          }
        }
      }
      const want = phase === 'grid' || phase === 'intro' ? 'grid' : phase === 'race' && e.quiet !== 1 ? (v.final ? 'final' : 'race') : ''
      const songKey = want && `${v.id}:${want}`
      if (songKey !== e.song && audio) {
        e.song = songKey
        if (!want) audio.stop()
        else {
          const m = snd.music[want as 'grid' | 'race' | 'final']
          const from = want === 'grid' ? null : v.start! + LIGHTS
          audio.loop(m.src, snd.music_volume, () => (from === null ? 0 : serverClock.now() / 1000 - from)) // a reload joins mid-song
        }
      }

      if (phase === 'gone') {
        if (sig !== 'gone') setShown({ phase, lap: '', line: '', rows: [], lit: 0, guard: false, photo: false, result: null })
        sig = 'gone'
        return
      }
      if (cv.current && ui.current) drawRace(cv.current, ui.current, race, ms / 1000)

      const going = phase === 'race' || phase === 'result'
      const rows = ranked(race).map((b, i) => ({ pos: i + 1, name: b.name, color: b.color, tag: b.place ? '' : TAGS[b.st] || (b.boost > 0 ? 'SURGE' : b.heatT > 0 ? 'HOT' : '') }))
      const lit = phase === 'lights' ? clamp(Math.floor((race.t + LIGHTS) / 0.6) + 1, 0, 5) : 0
      const lap = going ? `LAP ${lapOf(race)}/${race.laps}` : `${race.laps} LAPS`
      const won = phase === 'result' && v.final && !ranked(race)[0].csat && now - v.start! >= race.wall + 4
      const line = won ? LINES.csat2 : going ? race.line || LINES.off : phase === 'intro' || (phase === 'lights' && v.final) ? LINES.horn : LINES.grid
      const result = phase === 'result' ? resultOf(v, race) : null
      const next = JSON.stringify([phase, lap, line, rows.map((x) => x.name + x.tag), lit, !!race.guard, !!race.photo, result?.title])
      if (next !== sig) {
        sig = next
        setShown({ phase, lap, line, rows, lit, guard: !!race.guard && phase === 'race', photo: !!race.photo && phase === 'race', result })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [v?.start, race, audio]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!v || !shown || shown.phase === 'gone') return null
  return (
    <div ref={fitTo} className="rc-tv" aria-label={v.final ? 'The final' : 'Bot bay race'}>
      <div className="rc-tvk" style={{ '--rc-k': k } as CSSProperties}>
        <div className="rc-board">
          <img className="rc-map" src={v.map} alt="The Bot bays from above: the boiler, the crates, the dispatch desk in the middle, the charging cradles along the near edge" />
          <canvas ref={cv} width={VW} height={VH} className="rc-race" role="img" aria-label="Cleaner bots racing laps round the dispatch desk, with a small crowd watching" />
          <canvas ref={ui} width={VW * 2} height={VH * 2} className="rc-ui" aria-hidden="true" />

          <div className="rc-stand">
            <div className="rc-lap">{shown.lap}</div>
            {shown.rows.map((x) => (
              <div key={x.name + x.pos} className="rc-row">
                <span className="rc-pos">{x.pos}</span>
                <span className="rc-sw" style={{ background: x.color }} />
                <span className="rc-who">{x.name}</span>
                <span className="rc-tag">{x.tag}</span>
              </div>
            ))}
          </div>

          <div className="rc-caller" aria-live="polite">
            {shown.line}
          </div>

          {shown.phase === 'lights' && (
            <div className="rc-lights">
              <div className="rc-lampbox">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={'rc-lamp big' + (i < shown.lit ? ' on' : '')} />
                ))}
              </div>
            </div>
          )}
          {shown.guard && <div className="rc-guard">GUARD.</div>}
          {shown.photo && <div className="rc-photo">PHOTO FINISH</div>}
          {shown.phase === 'intro' && (
            <div className="rc-intro">
              <img src={v.csat} alt="CSAT-1, a worn survey droid with cigar burns on its face" />
              <div>
                <div className="rc-champ">THE CHAMP</div>
                <div className="rc-csat">CSAT-1</div>
              </div>
            </div>
          )}
          {shown.result && (
            <div className="rc-result" style={{ color: shown.result.color }}>
              {shown.result.title}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
