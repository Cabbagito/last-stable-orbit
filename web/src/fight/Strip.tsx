import { useEffect, useState } from 'react'
import { ChipFx } from '../fx/ChipFx'
import { hpRing, ring } from '../lib/ring'
import { serverClock } from '../net/clock'
import { RingPortrait } from '../shell/RingPortrait'
import { useGame } from '../store/game'
import type { FightView, Fighter } from '../types'
import { COPIES, carousel, isDown, landing, nextUp, shownOrder } from './fights'

const STEP = 64 // px between slots
const SLOT = 56
const VISIBLE = 7 // slots across; the outer ones fade
const REEL = ['7', '2', '9', '4', '1', '8', '7']

/** When each fighter's number lands and takes its place; re-renders as each one does. */
export function useLanding(fight: FightView | undefined) {
  const [, tick] = useState(0)
  const { land, place }: ReturnType<typeof landing> = fight ? landing(fight) : { land: {}, place: {} }
  const key = fight ? fight.fighters.map((x) => `${x.token}@${x.joined ?? 0}`).join(',') + `:${fight.started}` : ''
  useEffect(() => {
    const now = serverClock.now() / 1000
    const at = [...Object.values(land), ...Object.values(place)].filter((s) => s > now).map((s) => (s - now) * 1000 + 30)
    const ids = at.map((ms) => window.setTimeout(() => tick((n) => n + 1), ms))
    return () => ids.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { land, place }
}

/** A Reflex die spinning; `k` puts the reels out of step, so they look like separate dice. */
export function Reel({ k }: { k: number }) {
  return (
    <span className="app-fwin">
      <span className="app-freel" style={{ animationDelay: `${-(k % 6) * 0.07}s` }}>
        {REEL.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </span>
    </span>
  )
}

/**
 * The turn strip along the top of the map (Round 16): whoever's turn it is sits in the middle, larger, NOW over
 * them and a bar under them, NEXT over the next one; the rest fade to either side, with R2 where the next round
 * starts. When the fight starts, each slot spins a Reflex reel in the order the GM picked them and its number
 * lands, at the same moment on every screen (server time), then the strip sorts itself and the numbers fade.
 */
export function FightStrip({ fight }: { fight: FightView }) {
  const view = useGame((s) => s.view)
  const t = serverClock.now() / 1000
  const { land, place } = useLanding(fight)
  const settling = fight.fighters.some((x) => t < place[x.token])

  const n = fight.fighters.length
  const idx = fight.fighters.findIndex((x) => x.token === fight.now)
  const round = fight.round ?? 1
  // the strip slides on into the next round's copy of the order, then jumps back to the same picture
  const [pos, setPos] = useState({ p: n + Math.max(0, idx), snap: true, round })
  useEffect(() => {
    const home = n + Math.max(0, idx)
    if (round > pos.round && idx >= 0) {
      setPos({ p: 2 * n + idx, snap: false, round })
      const id = window.setTimeout(() => setPos({ p: home, snap: true, round }), 560)
      return () => clearTimeout(id)
    }
    setPos({ p: home, snap: pos.p === home ? pos.snap : false, round })
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fight.now, round, n])

  if (!view || !n) return null
  const byToken = (tok: string) => fight.fighters.find((x) => x.token === tok)!
  const next = settling ? null : nextUp(fight)
  const width = VISIBLE * STEP
  const mid = width / 2

  const head = (x: Fighter) => {
    const c = x.kind === 'crew' ? view.crew.find((m) => m.id === x.ref) : undefined
    const r = c ? ring(c.hp, c.entropy, 40, 4, c.health, c.entropy_max) : hpRing(x.hp, x.health, x.color, 40, 4)
    return (
      <ChipFx id={x.kind === 'crew' ? `c:${x.ref}` : `t:${x.token}`} down={isDown(x)} style={{ position: 'absolute', left: 0, top: 0, width: 40, height: 40 }}>
        <RingPortrait src={x.portrait} ring={r} size={40} />
      </ChipFx>
    )
  }

  let slots: { key: string; x: Fighter; left: number; cls: string; label: string; reel: boolean; num: string; k: number }[]
  if (settling) {
    // the dice landing: everyone in the order the GM picked them, centred
    const order = shownOrder(fight, t)
    slots = order.map((tok, k) => {
      const x = byToken(tok)
      return {
        key: `1:${tok}`, x, left: mid + (k - (order.length - 1) / 2) * STEP - SLOT / 2, cls: 'app-fslot' + (isDown(x) ? ' down' : ''),
        label: '', reel: t < land[tok], num: t >= land[tok] ? 'app-fnum' : '', k,
      }
    })
  } else {
    slots = carousel(n, pos.p, round).map((q) => {
      const x = fight.fighters[q.k]
      const now = q.off === 0 && x.token === fight.now
      return {
        key: `${Math.floor(q.i / n)}:${x.token}`, x, left: mid + q.off * STEP - SLOT / 2,
        cls: 'app-fslot' + (q.hidden ? ' out' : '') + (now ? ' now' : '') + (isDown(x) ? ' down' : ''),
        label: now ? 'NOW' : x.token === next && q.off > 0 && q.off <= n ? 'NEXT' : '', reel: false, num: 'app-fnum gone', k: q.k, // once the order is set, only the order matters
      }
    })
  }
  const divs = settling ? [] : Array.from({ length: COPIES }, (_, c) => c).map((c) => {
    const off = c * n - pos.p
    const r = round + (c - Math.floor(pos.p / n))
    return { c, left: mid + off * STEP - STEP / 2, label: `R${r}`, out: r < 1 || Math.abs(off) > 4 }
  })

  return (
    <div className={'app-fight' + (view.me.role === 'gm' ? ' gm' : '')} aria-label={`Turn order${fight.now ? `, ${byToken(fight.now)?.name}'s turn` : ''}`}>
      <div className="app-fbox" style={{ width }}>
      <div className={'app-fstrip' + (pos.snap ? ' snap' : '')} style={{ width }}>
        {divs.map((d) => (
          <div key={d.c} className={'app-fdiv' + (d.out ? ' out' : '')} style={{ left: d.left }}>
            <span>{d.label}</span>
          </div>
        ))}
        {slots.map((s) => (
          <div key={s.key} className={s.cls} style={{ left: s.left }} title={s.x.name}>
            <span className="app-flab">{s.label}</span>
            <span className="app-fhead">{head(s.x)}</span>
            <span className="app-fbar" />
            <span className="app-fini">
              {s.reel && <Reel k={s.k} />}
              {s.num && <span className={s.num}>{s.x.ini}</span>}
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
