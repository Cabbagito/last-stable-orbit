import { useEffect, useRef, useState } from 'react'
import { send, useGame } from '../store/game'
import type { InvEntry, RacePrepView } from '../types'
import { drawBig, FACES, LIGHTS, PAINTS, SPOILERS, STRIPES, TOPPERS, WHEELS } from './draw'
import type { Look } from './sim'

// Bot bay racing, a player's laptop (the canvas's Prep board): dress, tune, fuel, rev, in that order. No instructions
// and no replay. The tune is the server's roll and the fuel leaves their pockets on the server; what the fuel does is
// never sent here, only the line the bot says. When they've revved, the TV has it.

export const PREP = { w: 1152, h: 648 }
const GAIN = 0.065 // each press of the spacebar
const LIGHTS_S = 5 // seconds of revving
const SHUFFLE = 15 // the tune's die shows this many random faces, 60 ms apart, before it lands
const STEPS = ['DRESS', 'TUNE', 'FUEL', 'REV']
const PARTS: [keyof Look, string, string[]][] = [['spoiler', 'SPOILER', SPOILERS], ['stripes', 'STRIPES', STRIPES], ['wheels', 'WHEELS', WHEELS], ['topper', 'ANTENNA', TOPPERS], ['face', 'FACE', FACES], ['paint', 'PAINT', PAINTS], ['lights', 'LIGHTS', LIGHTS]]
const REV_COLOR: Record<string, string> = { PERFECT: '#7ee0a8', STALLED: '#ff8a94' }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const NO_POCKETS: InvEntry[] = []

/** The racer's prep, kept on screen while the overview layer sinks away once they're done. */
export function LaptopRace() {
  const live = useGame((s) => (s.view?.race && !('seed' in s.view.race) ? s.view.race : null))
  const last = useRef<RacePrepView | null>(live)
  if (live) last.current = live
  const r = last.current
  return r ? <Prep key={r.id} r={r} /> : null
}

function Prep({ r }: { r: RacePrepView }) {
  const me = useGame((s) => s.view?.me.char ?? '')
  const pockets = useGame((s) => s.view?.inventory[me] ?? NO_POCKETS)
  const [step, setStep] = useState(r.done || r.fuel ? 3 : r.tune ? 2 : 0)
  const [look, setLook] = useState<Look>(r.look)
  const [name, setName] = useState(r.name)
  const [num, setNum] = useState(r.num)
  // the tune: the server rolls; the die shuffles here, then lands on what it rolled
  const [rolling, setRolling] = useState(0) // faces shown so far, while rolling
  const [face, setFace] = useState(r.tune ? String(r.tune.total) : '?')
  const landed = !!r.tune && rolling === 0
  // the fuel: what's in their pockets as they came to it, so the burned item stays on the grid
  const grid = useRef<InvEntry[]>(pockets)
  if (!r.fuel) grid.current = pockets
  const [picked, setPicked] = useState<string | null>(r.fuel ? (r.fuel.item === 'none' ? 'none' : grid.current.find((e) => e.item.id === r.fuel!.item)?.uid ?? null) : null)
  const [burning, setBurning] = useState(false)
  // the rev
  const [rev, setRev] = useState<'idle' | 'count' | 'done'>(r.done ? 'done' : 'idle')
  const [level, setLevel] = useState(0)
  const [lit, setLit] = useState(0)
  const st = useRef({ level: 0, t: 0, rev: rev as string })
  const cv = useRef<HTMLCanvasElement>(null)
  const key = useRef<HTMLButtonElement>(null)

  // the bot on its pad, every frame; and the rev's needle falling back
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const s = st.current
      if (s.rev === 'count') {
        s.t += dt
        s.level = clamp(s.level - (0.12 + 0.45 * s.level) * dt, 0, 1)
        if (s.t >= LIGHTS_S) {
          s.rev = 'done'
          setRev('done')
          setLit(0)
          void send('race.rev', { id: r.id, level: s.level })
        } else setLit(Math.min(5, Math.floor(s.t) + 1))
        setLevel(s.level)
      }
      if (cv.current) drawBig(cv.current, look, r.color, num || '0', now / 1000, s.rev === 'count' ? 0.2 + s.level : 0)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [look, num, r.color, r.id])

  // the die shuffling
  useEffect(() => {
    if (!rolling) return
    const t = window.setTimeout(() => {
      if (rolling < SHUFFLE || !r.tune) {
        setFace(String(1 + Math.floor(Math.random() * r.die)))
        setRolling(rolling + 1)
      } else {
        setFace(String(r.tune.total))
        setRolling(0)
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [rolling, r.tune, r.die])

  useEffect(() => {
    if (r.fuel) setBurning(false)
  }, [r.fuel])

  const revHit = () => {
    const s = st.current
    if (s.rev === 'done') return // no replay
    if (s.rev === 'idle') {
      s.rev = 'count'
      s.t = 0
      setRev('count')
      setLit(1)
    }
    s.level = Math.min(1, s.level + GAIN)
    setLevel(s.level)
  }

  // the spacebar, on the rev step: one press is one press, however long it's held
  useEffect(() => {
    if (step !== 3) return
    key.current?.focus({ preventScroll: true })
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      e.stopPropagation()
      if (!e.repeat) revHit()
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [step])

  const dressed = () => {
    void send('race.dress', { id: r.id, look, name, num })
    setStep(1)
  }
  const tuneGo = () => {
    if (landed) return setStep(2)
    if (rolling || r.tune) return
    setRolling(1)
    void send('race.tune', { id: r.id })
  }
  const fuelGo = () => {
    if (r.fuel) return setStep(3)
    if (!picked || burning) return
    setBurning(true)
    void send('race.fuel', { id: r.id, uid: picked === 'none' ? null : picked })
  }
  const cycle = (k: keyof Look, n: number, d: number) => setLook((l) => ({ ...l, [k]: (l[k] + d + n) % n }))

  const tune = landed ? r.tune : null
  const band = r.revs.find((b) => b.below === null || level < b.below) ?? r.revs[r.revs.length - 1]
  const revName = rev === 'done' ? (r.rev ?? band.name) : ''
  const tiles = [...grid.current.map((e) => ({ id: e.uid, name: r.names[e.item.id] ?? e.item.name.toUpperCase(), icon: e.item.icon as string | null })), { id: 'none', name: r.none, icon: null }]

  return (
    <div className="rc-prep" style={{ '--rc-bot': r.color } as React.CSSProperties}>
      <canvas ref={cv} width={160} height={112} className="rc-big" role="img" aria-label="Your cleaner bot on its cradle pad, side on, wearing what you picked" />
      <div className="rc-name">{name || '—'}</div>

      <div className="rc-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={'rc-step' + (i === step ? ' on' : i < step ? ' past' : '')}>
            {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="rc-panel">
          {PARTS.map(([k, label, list]) => (
            <div key={k} className="rc-part">
              <span className="rc-lbl">{label}</span>
              <button type="button" className="rc-arrow" aria-label={'Previous ' + label.toLowerCase()} onClick={() => cycle(k, list.length, -1)}>
                &lt;
              </button>
              <span className="rc-val">{list[look[k]]}</span>
              <button type="button" className="rc-arrow" aria-label={'Next ' + label.toLowerCase()} onClick={() => cycle(k, list.length, 1)}>
                &gt;
              </button>
            </div>
          ))}
          <div className="rc-tag">
            <label htmlFor="rc-botname" className="rc-lbl">
              NAME
            </label>
            <input id="rc-botname" className="rc-in" type="text" maxLength={10} value={name} onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 10))} autoComplete="off" spellCheck={false} />
            <label htmlFor="rc-botnum" className="rc-lbl short">
              NO.
            </label>
            <input id="rc-botnum" className="rc-in num" type="text" inputMode="numeric" maxLength={2} value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} autoComplete="off" />
          </div>
          <button type="button" className="rc-cta" onClick={dressed}>
            NEXT
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="rc-panel mid">
          <div className="rc-die">D{r.die}</div>
          <div className="rc-shown" style={{ color: tune ? (tune.bad ? '#ff8a94' : '#ffffff') : '#8a8e96' }}>
            {face}
          </div>
          <div className="rc-tune" aria-live="polite" style={{ color: tune?.bad ? '#ff8a94' : '#ffffff' }}>
            {tune?.name ?? ''}
          </div>
          <button type="button" className="rc-cta" onClick={tuneGo}>
            {landed ? 'NEXT' : 'ROLL'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="rc-panel fuel">
          <div className="rc-fuels">
            {tiles.map((f) => {
              const on = picked === f.id
              const gone = !!r.fuel && !on
              return (
                <button key={f.id} type="button" className={'rc-fuel' + (on ? ' on' : '')} aria-pressed={on} style={{ opacity: gone ? 0.35 : 1 }} onClick={() => !r.fuel && !burning && setPicked(f.id)}>
                  <span className="rc-icon">{f.icon && <img src={f.icon} alt="" />}</span>
                  <span className="rc-fname">{f.name}</span>
                </button>
              )
            })}
          </div>
          <div className="rc-line" aria-live="polite">
            {r.fuel?.line ?? ''}
          </div>
          <button type="button" className="rc-cta" style={{ opacity: r.fuel || picked ? 1 : 0.35 }} onClick={fuelGo}>
            {r.fuel ? 'NEXT' : 'BURN'}
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="rc-panel mid">
          <div className="rc-lamps">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={'rc-lamp' + (rev === 'count' && i < lit ? ' on' : '')} />
            ))}
          </div>
          <div className="rc-gauge" role="img" aria-label={`Rev gauge at ${Math.round(level * 100)} percent. Green is 78 to 88.`}>
            <div className="rc-green" />
            <div className="rc-red" />
            <div className="rc-fill" style={{ width: `${(level * 100).toFixed(1)}%` }} />
            <div className="rc-needle" style={{ left: `${(level * 100).toFixed(1)}%` }} />
          </div>
          <div className="rc-rev" aria-live="polite" style={{ color: REV_COLOR[revName] ?? '#e7e9ec' }}>
            {revName}
          </div>
          <button ref={key} type="button" className="rc-cta rc-space" onClick={(e) => e.detail > 0 && revHit()} disabled={rev === 'done'}>
            SPACE
          </button>
        </div>
      )}
    </div>
  )
}
