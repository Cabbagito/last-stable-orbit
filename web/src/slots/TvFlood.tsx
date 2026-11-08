import { useMemo, type CSSProperties } from 'react'
import { useGame } from '../store/game'
import { coins } from './slots'

const MACHINES = [0, 1, 2, 3]

/** The flood, on the TV (the Slots canvas's last board): all four machines pay out at once, as big as it gets. */
export function TvFlood() {
  const f = useGame((s) => s.view?.stage.flood ?? null)
  const piles = useMemo(() => MACHINES.map((i) => coins(24, 11 + i * 97, 210, 150, 110, -1.4, [0.9, 0.5])), [])
  if (!f) return null
  const a = f.art
  return (
    <div className="sl-flood" aria-label="The slot machines pay out">
      <div className="sl-flstage">
        <div className="sl-flglow" />
        <div className="sl-flfloor" />
        {MACHINES.map((i) => (
          <div key={i} className="sl-flm" style={{ left: 44 + i * 300 }}>
            <img src={a.lit_a} alt="" />
            <img className="sl-chase" src={a.lit_b} alt="" style={{ animationDelay: `${i * 0.15}s` }} />
            <div className="sl-flscreen">
              <div className="sl-blink">EVENT<br />HORIZON!</div>
              <div className="sl-flnum">+{f.paid[i] ?? 0}</div>
            </div>
            <img src={a.crank_up} alt="A slot machine paying out" />
            <div className="sl-flcoins">
              {piles[i].map((c, k) => (
                <span key={k} className="sl-cx" style={{ '--dx': `${c.dx}px`, animationDuration: `${c.t}s`, animationDelay: `${c.d}s` } as CSSProperties}>
                  <img className="sl-cy" src={a.coin} alt="" style={{ '--dy': `${c.dy}px`, animationDuration: `${c.t}s`, animationDelay: `${c.d}s` } as CSSProperties} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
