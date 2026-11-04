import { useEffect, useMemo, useRef, useState } from 'react'
import { plainRing, ring } from '../lib/ring'
import { RollClock } from '../roll/clock'
import { RollFX } from '../roll/rollfx'
import { lookOf } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { useGame } from '../store/game'
import type { RollView } from '../types'

const HOLD = 3800 // ms the band stays after the dice settle
const SLIDE = 600 // its slide away

/**
 * Round 12's TV 2: a public roll slides up in a band along the bottom of the TV, with the roller, the stat and
 * the real dice animation, then slides away. The map stays put. The TV gets the dice as the roll starts, as the
 * roller's screen does, so both play the same animation together; at an explosion the band waits until the
 * roller's screen has rolled again. `onFocus` names the roller's token, for the camera that cuts to them.
 */
export function TvBand({ onFocus }: { onFocus: (token: string | null) => void }) {
  const rolls = useGame((s) => s.view?.rolls)
  const seen = useRef<Set<string> | null>(null)
  const [cur, setCur] = useState<{ id: string; out: boolean } | null>(null)

  // a roll that starts while the TV watches gets the band; ones already under way when it connected don't
  useEffect(() => {
    if (!rolls) return
    if (!seen.current) {
      seen.current = new Set(rolls.map((r) => r.id))
      return
    }
    const fresh = rolls.filter((r) => !seen.current!.has(r.id) && r.open && r.dice && !r.hidden)
    fresh.forEach((r) => seen.current!.add(r.id))
    const newest = fresh[fresh.length - 1]
    if (newest) setCur({ id: newest.id, out: false })
  }, [rolls])

  const roll = rolls?.find((r) => r.id === cur?.id)
  useEffect(() => onFocus(cur && !cur.out ? roll?.token ?? null : null), [cur, roll?.token, onFocus])

  const done = () => {
    const id = cur?.id
    window.setTimeout(() => setCur((c) => (c && c.id === id ? { ...c, out: true } : c)), HOLD)
    window.setTimeout(() => setCur((c) => (c && c.id === id ? null : c)), HOLD + SLIDE)
  }

  return <Band key={cur?.id ?? 'none'} roll={cur ? roll : undefined} out={!cur || cur.out} onDone={done} />
}

function Band({ roll, out, onDone }: { roll: RollView | undefined; out: boolean; onDone: () => void }) {
  const crew = useGame((s) => (roll?.char ? s.view?.crew.find((c) => c.id === roll.char) : undefined))
  const tok = useGame((s) => (roll?.token && !roll.char ? s.view?.tokens[roll.token] : undefined))
  const cv = useRef<HTMLCanvasElement>(null)
  const clock = useRef<RollClock | null>(null)
  const [up, setUp] = useState(false)
  const diceKey = roll?.dice?.join(',')
  const plan = useMemo(() => {
    if (!roll?.dice) return null
    const L = lookOf(roll.stat)
    return RollFX.plan({
      mode: L.mode,
      rolls: roll.dice,
      sides: roll.sides,
      bonus: roll.bonus ?? 0,
      seed: roll.seed ?? 1,
      color: L.fx,
      style: 'custom',
      aspect: 1.6,
      handle: roll.handle,
      insult: roll.insult,
    })
    // fixed by the server's dice and seed; later frames (pushes) don't change it
  }, [roll?.id, diceKey])

  // slide up on the next frame, so the transition runs
  useEffect(() => {
    const t = requestAnimationFrame(() => setUp(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    if (!plan) return
    const c = new RollClock(plan, performance.now(), { land: () => undefined, gate: () => undefined, done: onDone })
    clock.current = c
    let raf = 0
    const frame = () => {
      const f = c.tick(performance.now())
      const el = cv.current
      const x = el?.getContext('2d')
      if (f && el && x) {
        // the band is laid out at Round 12's size and scaled to the TV: draw at the size it shows, so it stays sharp
        const w = el.clientWidth
        const h = el.clientHeight
        const k = (w ? el.getBoundingClientRect().width / w : 1) * Math.min(2, window.devicePixelRatio || 1)
        if (el.width !== Math.round(w * k) || el.height !== Math.round(h * k)) {
          el.width = Math.round(w * k)
          el.height = Math.round(h * k)
        }
        x.setTransform(k, 0, 0, k, 0, 0)
        RollFX.draw(x, w, h, plan, f.t, f.wait ? { wait: f.wait } : { spent: 0 })
      }
      if (!c.done) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [plan])

  // follow the roller's screen: past an explosion once it has rolled again, to the end if it skipped
  const shown = roll?.shown ?? 0
  useEffect(() => {
    const c = clock.current
    if (!c || c.done) return
    if (c.holding && shown > c.landedCount) c.release(performance.now())
    else if (plan && shown >= plan.passes.length && c.landedCount < shown - 1) c.skip()
  }, [shown, plan])

  if (!roll) return <div className="app-band" aria-hidden="true" />
  const L = lookOf(roll.stat)
  const name = crew?.short ?? tok?.name ?? ''
  const portrait = crew?.portrait ?? tok?.portrait
  const r = crew ? ring(crew.hp, crew.entropy, 120, 12) : plainRing(tok?.color ?? '#2f3238', 120, 8)
  const landed = roll.phase !== 'roll' && roll.phase !== 'boom'
  return (
    <div className={'app-band' + (up && !out ? ' on' : '')} style={{ '--c': L.col } as React.CSSProperties}>
      <div className="app-bwho">
        {portrait && <RingPortrait src={portrait} ring={r} size={120} />}
        <div>
          <div className="app-bname">{name}</div>
          <div className="app-blab">
            {L.name} · D{roll.sides}
          </div>
        </div>
      </div>
      <div className="app-bcv">
        <canvas ref={cv} aria-hidden="true" />
      </div>
      <div className="app-sr" aria-live="polite">
        {landed ? `${name} rolled ${L.title}: ${roll.phase === 'nat1' ? 'a natural 1' : roll.value}` : ''}
      </div>
    </div>
  )
}
