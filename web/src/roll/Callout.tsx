import type { CSSProperties } from 'react'
import type { RollView, StatKey } from '../types'
import { STAT_LOOK } from './stats'

// Round 7 on the UI canvas: what everyone else sees while someone rolls. A spinning ring in the stat's
// colour, and a small chip: a looping glyph while rolling, "EXPLODES" in gold, then the number.

const STRIPS: Partial<Record<StatKey, { cls: string; frames: string[] }>> = {
  reflex: { cls: 'r7-strip g-reel', frames: ['7', '2', '9', '4', '1', '8', '7'] },
  tech: { cls: 'r7-strip g-dec', frames: ['0x', 'A7', 'F3', '1C', '9E', 'B2', '0x'] },
  intel: { cls: 'r7-strip g-sol', frames: ['∑', '∫', 'π', '√', 'Δ', '∂', '∑'] },
}

export const isSpinning = (r: RollView) => r.phase === 'roll' || r.phase === 'boom'

/** The dashed ring that spins around a head while its roll is in the air. */
export function Orbit({ stat }: { stat: StatKey }) {
  return (
    <svg className="r7-orbit" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="none" stroke={STAT_LOOK[stat].col} strokeWidth="2.2" strokeDasharray="46 256" strokeLinecap="round" />
    </svg>
  )
}

function Glyph({ stat }: { stat: StatKey }) {
  const strip = STRIPS[stat]
  if (strip)
    return (
      <span className="r7-win">
        <span className={strip.cls}>
          {strip.frames.map((f, i) => (
            <span key={i} className="r7-fr">
              {f}
            </span>
          ))}
        </span>
      </span>
    )
  if (stat === 'body')
    return (
      <svg className="r7-body" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <rect x="4" y="4" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="1.7" fill="currentColor" />
      </svg>
    )
  if (stat === 'cool') return <span className="r7-cool">?</span>
  return (
    <svg className="r7-pulse" viewBox="0 0 28 20" width="28" height="20" aria-hidden="true">
      <path d="M0 11 H7 L9 6 L12 16 L15 3 L18 13 L20 11 H28" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function calloutLabel(r: RollView): string {
  const name = STAT_LOOK[r.stat].name
  if (r.phase === 'boom') return 'EXPLODES'
  if (r.phase === 'nat1') return 'NATURAL 1'
  if (r.phase === 'push') return `PUSHED +${r.pushed}`
  if ((r.count ?? 1) > 1) return `${name} ×${r.count}`
  return name
}

/** Spoken version, for the token's and the rail's accessible names. */
export function calloutSpeech(r: RollView): string {
  const title = STAT_LOOK[r.stat].title
  if (isSpinning(r)) return `rolling ${title}${r.phase === 'boom' ? ', it exploded' : ''}`
  if (r.phase === 'nat1') return `rolled ${title}: natural 1`
  return `rolled ${title}: ${r.value}`
}

/** side: "s-t" above a token's head on the map, "s-l" left of a ring in the crew rail. */
export function Callout({ r, side, fading }: { r: RollView; side: 's-t' | 's-l'; fading: boolean }) {
  const L = STAT_LOOK[r.stat]
  const spinning = isSpinning(r)
  return (
    <div
      className={`r7-call ${side} p-${r.phase}${fading ? ' p-fade' : ''}`}
      style={{ '--c': L.col, '--fx': L.fx } as CSSProperties}
      aria-hidden="true"
    >
      <span className="r7-lab">{calloutLabel(r)}</span>
      <span className="r7-chip">
        {spinning ? <Glyph stat={r.stat} /> : <span className="r7-num">{r.value}</span>}
        {r.phase === 'nat1' && (
          <svg className="r7-crack" viewBox="0 0 40 30" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="3,1 14,12 10,17 23,24 20,30" fill="none" stroke="#ff5b4d" strokeWidth="1.1" />
            <polyline points="14,12 29,8 39,13" fill="none" stroke="#ff5b4d" strokeWidth="1" />
          </svg>
        )}
      </span>
      {r.phase === 'push' && <span className="r7-plus">+{r.pushes ? r.pushed / r.pushes : 0}</span>}
    </div>
  )
}

/** Remount on each phase and each push, so the CSS entrance animations play again. */
export const calloutKey = (r: RollView) => `${r.id}-${r.phase}-${r.pushes}`
