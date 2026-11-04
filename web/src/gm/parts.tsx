import type { ReactNode } from 'react'
import { gmRun } from '../store/game'
import type { CrewMember, InvEntry, Item } from '../types'

// Pieces of Round 12 the GM's Scene, its cards and the GM tab share.

export const HP_MAX = 6
export const ENTROPY_MAX = 6
export const GIVE_COUNTED = 50 // a counted item (credits) from the Give row: change the amount in the GM tab

/** The eye: open for "players see it", struck through for hidden. */
export function Eye({ off, size = 16 }: { off: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 8c1.6-3 3.8-4.5 6.5-4.5s4.9 1.5 6.5 4.5c-1.6 3-3.8 4.5-6.5 4.5S3.1 11 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 13.5L13.5 2.5" stroke="currentColor" strokeWidth="1.5" opacity={off ? 1 : 0} />
    </svg>
  )
}

export function Cross() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** The diamond a thing to inspect has on the map. */
export function Diamond() {
  return (
    <svg className="r10-dia" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M14 5 L23 14 L14 23 L5 14 Z" fill="#000" stroke="#fff" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2" fill="#fff" />
    </svg>
  )
}

/** − value + for HP or Entropy. `label` is shown beside it only when `showLabel`. */
export function Step({ who, label, value, max, tone, onChange, showLabel = true }: { who: string; label: 'HP' | 'EN'; value: number; max: number; tone: 'hp' | 'en'; onChange: (v: number) => void; showLabel?: boolean }) {
  return (
    <div className="r10-step" role="group" aria-label={`${who} ${label}`}>
      {showLabel && <span className="r4-lab">{label}</span>}
      <button type="button" className="r10-sq" aria-label={`${who} ${label} down`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={`r10-num r9-${tone}`}>{value}</span>
      <button type="button" className="r10-sq" aria-label={`${who} ${label} up`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}

/** HP and Entropy steppers for one crew member. */
export function Vitals({ c, showLabels = true }: { c: CrewMember; showLabels?: boolean }) {
  const set = (field: 'hp' | 'entropy', v: number) => void gmRun('gm.vitals.set', { char: c.id, [field]: v })
  return (
    <>
      <Step who={c.short} label="HP" tone="hp" value={c.hp} max={HP_MAX} showLabel={showLabels} onChange={(v) => set('hp', v)} />
      <Step who={c.short} label="EN" tone="en" value={c.entropy} max={ENTROPY_MAX} showLabel={showLabels} onChange={(v) => set('entropy', v)} />
    </>
  )
}

export const itemAria = (e: InvEntry) => e.item.name + (e.item.counted ? `, ${e.count ?? 0}` : '') + (e.new ? ', not looked at yet' : '')

/**
 * One pocket: the icon, its name on hover or focus, NEW until its holder has looked, the amount on a counted
 * item, and × to take it back. `button` makes the icon a button (the GM tab picks items up with it); `badge`
 * off leaves the amount to a field beside it.
 */
export function Pocket({ e, holder, button, carry, badge = true }: { e: InvEntry; holder: CrewMember; button?: ReactNode; carry?: boolean; badge?: boolean }) {
  return (
    <span className={'r10-pk' + (e.new ? ' new' : '') + (carry ? ' carry' : '')}>
      {button ?? <img src={e.item.icon} alt={itemAria(e)} className="r3-px" style={{ width: 48, height: 48, display: 'block' }} tabIndex={0} />}
      {badge && e.item.counted && <span className="r9-count">{e.count ?? 0}</span>}
      {e.new && <span className="r9-newtag">NEW</span>}
      <span className="r10-pkname" aria-hidden="true">
        {e.item.name}
      </span>
      <button type="button" className="r10-take" aria-label={`Take ${e.item.name} from ${holder.short}`} title="Take it back" onClick={() => void gmRun('gm.item.take', { holder: holder.id, uid: e.uid })}>
        <Cross />
      </button>
    </span>
  )
}

/** Every item in the catalogue, to hand to `to`. Each shows its name on hover and focus. */
export function GiveRow({ to, items }: { to: CrewMember; items: Item[] }) {
  const give = (it: Item) =>
    void gmRun('gm.item.give', it.counted ? { holder: to.id, item: it.id, count: GIVE_COUNTED } : { holder: to.id, item: it.id })
  return (
    <>
      {items.map((it) => {
        const name = it.name + (it.counted ? ` (+${GIVE_COUNTED})` : '')
        return (
          <button key={it.id} type="button" className="r10-gv" aria-label={`Give ${to.short} ${it.name}` + (it.counted ? `, ${GIVE_COUNTED}` : '')} onClick={() => give(it)}>
            <img src={it.icon} alt="" className="r3-px" />
            <span className="r10-pkname" aria-hidden="true">
              {name}
            </span>
          </button>
        )
      })}
    </>
  )
}
