import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { TvAudio } from '../stage/music'
import { send, useGame } from '../store/game'
import type { RushView } from '../types'
import { ids, ms, simulate, type RushBowl, type RushServe, type Shift, type Ticket } from './sim'

// Sarge's rush (the canvas LSO — Sarge's rush, board Main): the cook's screen, and the same picture on the TV. Both
// play the shift out from its seed and the serves, every 100 ms as the prototype did; the cook's own serves show at
// once and go to the server, which keeps the tally. All the sound is the TV's.

export const BOARD = { w: 1600, h: 900 }
const EMPTY: RushBowl = { n: null, b: null, t: [] }

type Phase = 'idle' | 'run' | 'done'
interface Now {
  phase: Phase
  el: number // ms since clocking in
  shift: Shift | null
}

function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set((n) => n + 1), 100)
    return () => window.clearInterval(t)
  }, [on])
}

/** The shift as it stands now, from the server's serves and any of the cook's own that haven't come back yet. */
function shiftNow(r: RushView, mine: RushServe[], start: number | null): Now {
  if (start === null) return { phase: 'idle', el: 0, shift: null }
  const SHIFT = ms(r.game.shift)
  const el = Math.max(0, Math.round(serverClock.now() - start * 1000))
  const serves = [...r.serves, ...mine.filter((x) => !r.serves.some((y) => y.k === x.k))]
  return { phase: el >= SHIFT ? 'done' : 'run', el, shift: simulate(r.game, r.seed, serves, Math.min(el, SHIFT)) }
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.ceil(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

interface Cook {
  pick: (kind: 'n' | 'b' | 't', id: string) => void
  serve: () => void
  clockIn: () => void
}

/** The board itself, 1600 x 900. The cook's has working bins and buttons; the TV's is the same picture. */
function Board({ r, now, bowl, cook }: { r: RushView; now: Now; bowl: RushBowl; cook?: Cook }) {
  const g = r.game
  const L = g.lines
  useEffect(() => {
    Object.values(r.art.layers).forEach((src) => (new Image().src = src)) // so the first pick shows at once
  }, [r.art.layers])
  const name = useMemo(() => Object.fromEntries([...g.noodles, ...g.broths, ...g.toppings]), [g])
  const { phase, el, shift } = now
  const red = !!shift?.red
  const rush = !!shift?.rush
  const left = phase === 'idle' ? g.shift : phase === 'done' ? 0 : g.shift - el / 1000
  const shown = phase === 'run' ? bowl : EMPTY
  const tops = (t: string[]) => {
    const n = ids(g.toppings).filter((id) => t.includes(id)).map((id) => name[id])
    return n.length <= 2 ? n.join(' + ') : `${n.slice(0, 2).join(' + ')}\n+ ${n.slice(2).join(' + ')}`
  }
  const ticket = (tk: Ticket) => {
    if (tk.kind === 'gran') return { who: g.ticket.gran.who, text: g.ticket.gran.text }
    if (tk.kind === 'csat') return { who: g.ticket.csat.who, text: g.ticket.csat.text }
    return { who: '', text: `${name[tk.n!]}\n${name[tk.b!]}${g.ticket.broth}\n${tops(tk.t)}` }
  }
  const layers = [r.art.bowl]
  if (shown.b) layers.push(r.art.layers[`b-${shown.b}`])
  if (shown.n) layers.push(r.art.layers[`n-${shown.n}`])
  ids(g.toppings).forEach((id) => shown.t.includes(id) && layers.push(r.art.layers[`t-${id}`]))
  const bins = (shelf: [string, string][], kind: 'n' | 'b' | 't', on: (id: string) => boolean) => (
    <div className="rs-group">
      {shelf.map(([id, label]) => (
        <button key={id} type="button" className="rs-bin ctl" aria-pressed={on(id)} tabIndex={cook ? 0 : -1} onClick={() => cook?.pick(kind, id)}>
          <img src={r.art.bins[id]} alt="" draggable={false} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className={'rs-board' + (rush ? ' rush' : '') + (red ? ' red' : '') + (cook ? '' : ' watch')}>
      <div className="rs-rail" />
      <div className="rs-slots">
        {[0, 1, 2, 3].map((i) => {
          const tk = phase === 'run' ? shift?.slots[i] : null
          const t = tk && ticket(tk)
          const frac = tk ? Math.max(0, 1 - (el - tk.born) / tk.pat) : 0
          return (
            <div key={i} className="rs-slot">
              <div className="rs-clip" />
              {tk && t && (
                <div className={'rs-tk ' + tk.kind}>
                  <div className="rs-tkh">
                    <span>
                      {g.ticket.number} {String(tk.id).padStart(2, '0')}
                    </span>
                    <span>{t.who}</span>
                  </div>
                  <div className="rs-tkt">{t.text}</div>
                  <div className="rs-bar">
                    <i className={frac < 0.3 ? 'low' : ''} style={{ width: `${(frac * 100).toFixed(1)}%` }} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rs-sarge">
        <img src={r.art.sarge} alt="Sarge, the noodle stall's cook" draggable={false} />
        <img className="red" src={r.art.sarge_red} alt="" aria-hidden="true" draggable={false} />
      </div>
      <div className="rs-bark" aria-live="polite">
        {phase === 'idle' ? L.idle : shift?.bark}
      </div>

      <div className="rs-bowl">
        {layers.map((src) => (
          <img key={src} src={src} alt="" draggable={false} />
        ))}
      </div>
      <div className="rs-clock">{mmss(left)}</div>
      {phase === 'run' && (
        <button type="button" className="rs-serve ctl" tabIndex={cook ? 0 : -1} onClick={() => cook?.serve()}>
          {L.serve}
        </button>
      )}

      <div className="rs-bins">
        {bins(g.noodles, 'n', (id) => shown.n === id)}
        {bins(g.broths, 'b', (id) => shown.b === id)}
        {bins(g.toppings, 't', (id) => shown.t.includes(id))}
      </div>

      {phase === 'idle' && (
        <div className="rs-card">
          <div className="rs-title">{L.title}</div>
          <button type="button" className="rs-go ctl" tabIndex={cook ? 0 : -1} onClick={() => cook?.clockIn()}>
            {L.clock_in}
          </button>
        </div>
      )}
      {phase === 'done' && shift && (
        <div className="rs-card done">
          <div className={'rs-rank' + (shift.rank === g.ranks[0].rank ? ' top' : '')}>{shift.rank}</div>
          <div className="rs-tally">
            {shift.out} OUT · {shift.wrong} WRONG · {shift.lost} LOST
          </div>
        </div>
      )}
    </div>
  )
}

/** On the cook's laptop, inside the overview layer: picks and serves answer at once. */
export function CookRush({ r }: { r: RushView }) {
  const g = r.game
  const [bowl, setBowl] = useState<RushBowl>(r.bowl)
  const [mine, setMine] = useState<RushServe[]>([])
  const [clocked, setClocked] = useState<number | null>(null)
  const k = useRef(Math.max(0, ...r.serves.map((x) => x.k)))
  const start = r.start ?? clocked
  useTick(true)
  const now = shiftNow(r, mine, start)

  useEffect(() => setMine((p) => p.filter((x) => !r.serves.some((y) => y.k === x.k))), [r.serves])

  const put = (b: RushBowl) => {
    setBowl(b)
    void send('rush.bowl', { id: r.id, ...b })
  }
  const cook: Cook = {
    pick(kind, id) {
      if (now.phase !== 'run') return
      if (kind === 'n') put({ ...bowl, n: bowl.n === id ? null : id })
      else if (kind === 'b') put({ ...bowl, b: bowl.b === id ? null : id })
      else put({ ...bowl, t: bowl.t.includes(id) ? bowl.t.filter((x) => x !== id) : ids(g.toppings).filter((x) => x === id || bowl.t.includes(x)) })
    },
    serve() {
      if (start === null) return
      const at = Math.round(serverClock.now() - start * 1000)
      if (at < 0 || at >= ms(g.shift)) return
      const sv: RushServe = { k: ++k.current, at, ...bowl }
      setMine((p) => [...p, sv])
      setBowl(EMPTY)
      void send('rush.serve', { id: r.id, ...sv }).then((ack) => {
        if (!ack.ok) setMine((p) => p.filter((x) => x.k !== sv.k))
      })
    },
    clockIn() {
      if (start !== null) return
      setClocked(serverClock.now() / 1000)
      void send('rush.clock_in', { id: r.id })
    },
  }
  return <Board r={r} now={now} bowl={bowl} cook={cook} />
}

/** On the TV: the cook's screen, live, filling the screen, with all of the sound. */
export function TvRush({ sound }: { sound: RollSound | null }) {
  const r = useGame((s) => s.view?.rush ?? null)
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useTick(!!r)
  const now = r ? shiftNow(r, [], r.start) : null
  const ac = sound?.context ?? null
  const audio = useMemo(() => (ac ? new TvAudio(ac) : null), [ac])
  const heard = useRef<{ id: string; keys: Set<string> } | null>(null)
  const song = useRef<string | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setK(Math.min(el.clientWidth / BOARD.w, el.clientHeight / BOARD.h) || 1)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!r])

  useEffect(() => () => audio?.stop(), [audio])
  useEffect(() => {
    if (audio && r?.sound) Object.values(r.sound.files).forEach((f) => void audio.load(f))
  }, [audio, r?.sound])

  // every tick: the cues that just happened, and the song for this part of the shift
  useEffect(() => {
    if (!audio || !r?.sound || !now) {
      audio?.stop()
      song.current = null
      return
    }
    const snd = r.sound
    const f = snd.files
    const cues = now.shift?.cues ?? []
    if (heard.current?.id !== r.id) heard.current = { id: r.id, keys: new Set(cues.filter((c) => c.at < now.el - 300).map((c) => c.key)) } // a reload stays quiet about the past
    const bark = (vol = snd.bark) => audio.play(f[snd.barks[Math.floor(Math.random() * snd.barks.length)]], vol, snd.bark_delay)
    for (const c of cues) {
      if (heard.current.keys.has(c.key)) continue
      heard.current.keys.add(c.key)
      if (now.el - c.at > 1500) continue
      const v = snd.volume
      const effect = { start: 'whistle_start', ticket: 'ticket_in', ok: 'serve_ok', wrong: 'wrong', lost: 'lost', rush: 'rush_klaxon', end: 'whistle_end' }[c.kind as string]
      if (effect) audio.play(f[effect], v)
      if (c.kind !== 'start') bark(c.kind === 'ok' ? snd.bark_ok : snd.bark) // Sarge answers everything
      const rank = c.kind === 'end' && r.game.ranks.find((x) => x.rank === now.shift?.rank)
      if (rank) audio.play(f[rank.sound], v, snd.rank_delay)
    }
    const R0 = ms(r.game.rush[0])
    const R1 = ms(r.game.rush[1])
    const want: ['shift' | 'rush', number] | null = now.phase !== 'run' ? null : now.el < R0 ? ['shift', 0] : now.el < R1 ? ['rush', R0] : ['shift', R1]
    const key = want && `${r.id}:${want[0]}:${want[1]}`
    if (key === song.current) return
    song.current = key
    if (!want) return audio.stop()
    const [which, from] = want
    const start = r.start!
    audio.loop(f[snd.music[which].file], snd.music_volume, () => (serverClock.now() - start * 1000 - from) / 1000) // a reload joins mid-song
  })

  if (!r || !now) return null
  return (
    <div ref={box} className="rs-tv" aria-label="Sarge's rush">
      <div className="rs-tvk" style={{ '--rs-k': k } as CSSProperties}>
        <Board r={r} now={now} bowl={r.bowl} />
      </div>
    </div>
  )
}

/** The cook's board, kept on screen while the overview layer sinks away after it closes. */
export function LaptopRush() {
  const live = useGame((s) => s.view?.rush ?? null)
  const last = useRef<RushView | null>(live)
  if (live) last.current = live
  const r = last.current
  return r ? <CookRush key={r.id} r={r} /> : null
}
