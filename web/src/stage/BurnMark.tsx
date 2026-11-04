import type { CSSProperties } from 'react'
import { serverClock } from '../net/clock'
import { useGame } from '../store/game'
import { burnPhase, type BurnPhase } from './burntime'

export interface BurnMarkState {
  char: string
  name: string
  color: string
  icon: string | null
  at: number
  phase: BurnPhase
  fading: boolean
}

/** The Burn that's going off (or just went off) right now, if its mark is still showing. */
export function useBurnMark(): BurnMarkState | null {
  const seen = useGame((s) => s.burnSeen)
  const crew = useGame((s) => s.view?.crew)
  useGame((s) => s.callTick) // re-render when it ends, fades and goes
  const st = burnPhase(seen, serverClock.now())
  if (!seen || !st) return null
  const icon = crew?.find((c) => c.id === seen.char)?.burn?.icon ?? null
  return { char: seen.char, name: seen.name, color: seen.color, icon, at: seen.at, ...st }
}

export const burnSpeech = (m: BurnMarkState) => (m.phase === 'on' ? `burning ${m.name}` : `burned ${m.name}`)

/** Around the head, in the Burn's colour: a ring that throws out shock waves while the film plays. */
export function Flare({ m }: { m: BurnMarkState }) {
  return (
    <svg className={`app-flare b-${m.phase}${m.fading ? ' p-fade' : ''}`} viewBox="0 0 100 100" style={{ '--c': m.color } as CSSProperties} aria-hidden="true">
      {m.phase === 'on' && <circle className="app-flare-wave" cx="50" cy="50" r="46" />}
      {m.phase === 'on' && <circle className="app-flare-wave w2" cx="50" cy="50" r="46" />}
      <circle className="app-flare-ring" cx="50" cy="50" r="46" />
    </svg>
  )
}

/** side: "s-t" above a token's head on the map, "s-l" left of a ring in the crew rail (as a roll's callout). */
export function BurnCallout({ m, side }: { m: BurnMarkState; side: 's-t' | 's-l' }) {
  return (
    <div className={`r7-call app-bmk ${side} b-${m.phase}${m.fading ? ' p-fade' : ''}`} style={{ '--c': m.color } as CSSProperties} aria-hidden="true">
      <span className="r7-lab">BURN</span>
      <span className="app-bmk-chip">
        {m.icon && <img src={m.icon} alt="" />}
        <span className="app-bmk-name">{m.name}</span>
      </span>
    </div>
  )
}
