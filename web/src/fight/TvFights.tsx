import { useEffect, useRef } from 'react'
import { ChipFx } from '../fx/ChipFx'
import { hpRing, ring } from '../lib/ring'
import { serverClock } from '../net/clock'
import type { RollSound } from '../roll/sound'
import { RingPortrait } from '../shell/RingPortrait'
import type { FightView, View } from '../types'
import { diceDue, shownOrder } from './fights'
import { Reel, useLanding } from './Strip'

const STEP = 60 // px between heads

/**
 * Each fight's turn order, along the bottom of the TV, one row per fight on any map (the one the TV shows first).
 * The Reflex roll plays out here at the same moment as on the laptops, with its sound: reels spin, the numbers land,
 * the row sorts, and the numbers give way to first, second, third. NOW marks whose turn it is once the dice are down.
 */
export function TvFights({ view, sound }: { view: View; sound: RollSound | null }) {
  const fights = view.fights
  const played = useRef(new Set<string>())

  useEffect(() => {
    if (!sound) return
    const t = serverClock.now() / 1000
    for (const f of fights ?? []) {
      const due = diceDue(f, t).filter((d) => !played.current.has(`${f.map}:${d.token}:${d.land}`))
      if (!due.length) continue
      due.forEach((d) => played.current.add(`${f.map}:${d.token}:${d.land}`))
      sound.initiative(
        due.map((d) => d.land - t),
        Math.max(...due.map((d) => d.place)) - t,
      )
    }
  }, [fights, sound])

  if (!fights?.length) return null
  return (
    <div className="app-tvfights" aria-label="Turn order">
      {fights.map((f) => (
        <TvFightRow key={f.map} fight={f} view={view} />
      ))}
    </div>
  )
}

function TvFightRow({ fight, view }: { fight: FightView; view: View }) {
  const { land, place } = useLanding(fight)
  const t = serverClock.now() / 1000
  const order = shownOrder(fight, t)
  const settling = fight.fighters.some((x) => t < place[x.token])
  // the slots keep one DOM order, by token, so moving to a new place slides instead of jumping
  const fighters = [...fight.fighters].sort((a, b) => a.token.localeCompare(b.token))
  return (
    <div className="app-tvfrow">
      <span className="app-tvfname">
        {fight.name}
        <span className="r5-sec">Round {fight.round ?? 1}</span>
      </span>
      <div className="app-tvfslots" style={{ width: fighters.length * STEP }}>
        {fighters.map((x) => {
          const c = x.kind === 'crew' ? view.crew.find((m) => m.id === x.ref) : undefined
          const r = c ? ring(c.hp, c.entropy, 52, 6, c.health) : hpRing(x.hp, x.health, x.color, 52, 5)
          const k = order.indexOf(x.token)
          const now = !settling && x.token === fight.now
          return (
            <div key={x.token} className={'app-tvfslot' + (now ? ' now' : '')} style={{ left: k * STEP + (STEP - 56) / 2 }}>
              <span className="app-tvfnow">{now && 'NOW'}</span>
              <span className="app-tvfhead">
                <ChipFx id={c ? `c:${c.id}` : `t:${x.token}`} down={x.hp <= 0} style={{ position: 'relative', display: 'block', width: 52, height: 52 }}>
                  <RingPortrait src={x.portrait} ring={r} size={52} />
                </ChipFx>
              </span>
              <span className="app-tvfini">
                {t < land[x.token] ? <Reel k={k} /> : t < place[x.token] ? <span className="app-fnum">{x.ini}</span> : <span className="app-tvfpos">{k + 1}</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
