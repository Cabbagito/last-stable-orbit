import type { CSSProperties, ReactNode } from 'react'
import { useGame } from '../store/game'
import type { Change } from './changes'

const COLOR: Partial<Record<Change['kind'], string>> = { heal: '#5ee08c', enDown: '#f2b544', got: '#ff4fa3' }

/**
 * Look C from Round 14 (R14ChipReact), around a 64 px head: the chip reacts to a change the GM made. A hit shakes
 * it with a red flash (and a crack for 3 or more), a heal or a spend sends out a wave, Entropy orbits into the ring,
 * an item lands on it as a badge or pops off it, and credits show their amount. `down` greys the chip for as long
 * as they're at 0. Everything is still for anyone with reduced motion on (fight.css).
 */
export function ChipFx({ id, down, children, style }: { id: string; down?: boolean; children: ReactNode; style?: CSSProperties }) {
  const fx = useGame((s) => s.fx[id])
  const cls = 'app-fx' + (down ? ' app-down' : '') + (fx ? ` fx-${fx.kind} fx-n${fx.n % 2}` : '')
  return (
    <span className={cls} style={style}>
      {children}
      {fx && <Layer key={fx.n} fx={fx} />}
    </span>
  )
}

function Layer({ fx }: { fx: Change }) {
  const k = fx.kind
  const wave = COLOR[k]
  const badge = k === 'got' || k === 'taken' || k === 'crUp' || k === 'crDown'
  return (
    <span className="fx-layer" aria-hidden="true">
      {(k === 'hit' || k === 'down') && <span className="fx-flash" />}
      {k === 'hit' && fx.big && (
        <svg className="fx-crack" viewBox="0 0 100 100">
          <polyline points="24,22 41,39 35,49 53,59 49,76" />
          <polyline points="41,39 58,33 75,41" />
        </svg>
      )}
      {wave && (
        <svg className="fx-waves" viewBox="0 0 100 100" style={{ '--c': wave } as CSSProperties}>
          <circle cx="50" cy="50" r="46" />
          <circle cx="50" cy="50" r="46" />
        </svg>
      )}
      {k === 'enUp' && (
        <svg className="fx-orbit" viewBox="0 0 100 100">
          <circle cx="50" cy="4" r="4.5" />
        </svg>
      )}
      {badge && fx.icon && (
        <span className={`fx-badge b-${k}`}>
          <img src={fx.icon} alt="" className="r3-px" />
        </span>
      )}
      {(k === 'crUp' || k === 'crDown') && fx.amount !== undefined && (
        <span className={`fx-num n-${k}`}>{(fx.amount > 0 ? '+' : '−') + Math.abs(fx.amount)}</span>
      )}
    </span>
  )
}
