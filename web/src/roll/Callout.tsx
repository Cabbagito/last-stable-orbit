import type { CSSProperties } from 'react'
import type { RollView, StatKey } from '../types'
import { lookOf } from './stats'

// Round 17: what's left of a roll on the map once the banner has it. A spinning ring around the head (and the crew
// rail's ring) while the dice fly, then a small chip on the token that holds the number until the roll closes.

export const isSpinning = (r: RollView) => r.phase === 'roll' || r.phase === 'boom'

/** The dashed ring that spins around a head while its roll is in the air. */
export function Orbit({ stat }: { stat: StatKey | null }) {
  return (
    <svg className="r7-orbit" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="none" stroke={lookOf(stat).col} strokeWidth="2.2" strokeDasharray="46 256" strokeLinecap="round" />
    </svg>
  )
}

/** Spoken version, for the token's and the rail's accessible names. */
export function calloutSpeech(r: RollView): string {
  const title = r.stat ? lookOf(r.stat).title : `a d${r.sides}`
  if (isSpinning(r)) return `rolling ${title}${r.phase === 'boom' ? ', it exploded' : ''}`
  if (r.phase === 'seal') return `rolled ${title}, hidden`
  if (r.phase === 'nat1') return `rolled ${title}: natural 1`
  return `rolled ${title}: ${r.value}`
}

/** The number above a token's head, in the stat's colour: red for a natural 1, "?" for a sealed roll. */
export function Chip({ r, fading }: { r: RollView; fading: boolean }) {
  const L = lookOf(r.stat)
  const nat1 = r.phase === 'nat1'
  const sealed = r.phase === 'seal'
  return (
    <span className={'r17-chipw' + (fading ? ' p-fade' : '')} style={{ '--c': L.col, '--fx': nat1 ? '#ff5b4d' : L.fx } as CSSProperties} aria-hidden="true">
      <span className="r17-chipl" style={nat1 ? { color: '#ff5b4d' } : undefined}>
        {nat1 ? 'NATURAL 1' : sealed ? 'HIDDEN' : L.name}
      </span>
      <span className="r17-chipn" style={nat1 ? { boxShadow: '0 0 0 1px #ff5b4d' } : undefined}>
        {sealed ? '?' : r.value}
      </span>
    </span>
  )
}

/** Remount on each change, so the entrance plays again. */
export const calloutKey = (r: RollView) => `${r.id}-${r.phase}-${r.pushes}`
