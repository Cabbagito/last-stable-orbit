import type { ReactNode } from 'react'
import type { TipBind } from '../inspect/ItemTip'
import { gmRun } from '../store/game'
import type { CrewMember, InvEntry, Item, Shelf } from '../types'

// Pieces of Round 12 the GM's Scene, its cards and the GM tab share.

export const HEALTH_CAP = 20 // the most a maximum can be raised to (the server's HEALTH_CAP and ENTROPY_CAP)
export const ENTROPY_CAP = 12
export const GIVE_COUNTED = 50 // a counted item (credits) picked off the shelf: change the amount on their row

/** Pockets in the pickers' order: the kit first, trash last, and chrome that's held at the very end. */
export function byShelf(entries: InvEntry[], shelves: Shelf[]): InvEntry[] {
  const at = (e: InvEntry) => {
    const i = shelves.findIndex((s) => s.id === e.item.shelf)
    return i < 0 ? shelves.length : i
  }
  return [...entries].sort((a, b) => at(a) - at(b)) // a stable sort: within a group, the order they were handed over
}

/** A group's items off the shelf, in the catalogue's order. */
export const onShelf = (items: Item[], shelf: Shelf) => items.filter((it) => it.shelf === shelf.id)

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

/** The little camera on an NPC's row: the TV follows them. */
export function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="4.5" width="9" height="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 7.2l4-2.2v6l-4-2.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
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
export function Step({ who, label, value, max, tone, onChange, showLabel = true, showMax = false }: { who: string; label: 'HP' | 'EN'; value: number; max: number; tone: 'hp' | 'en'; onChange: (v: number) => void; showLabel?: boolean; showMax?: boolean }) {
  return (
    <div className="r10-step" role="group" aria-label={`${who} ${label}`}>
      {showLabel && <span className="r4-lab">{label}</span>}
      <button type="button" className="r10-sq" aria-label={`${who} ${label} down`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={`r10-num r9-${tone}`}>
        {value}
        {showMax && <span className="gx-max">/{max}</span>}
      </span>
      <button type="button" className="r10-sq" aria-label={`${who} ${label} up`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}

/** The column's stepper: quiet until its row is hovered, and never hidden. `max` beside the value when `showMax`. */
export function MiniStep({ who, label, value, max, tone, onChange, showMax = false }: { who: string; label: string; value: number; max: number; tone: 'hp' | 'en'; onChange: (v: number) => void; showMax?: boolean }) {
  return (
    <div className="gx-step" role="group" aria-label={`${who} ${label}`}>
      <button type="button" aria-label={`${who} ${label} down`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={`r10-num r9-${tone}`}>
        {value}
        {showMax && <span className="gx-max">/{max}</span>}
      </span>
      <button type="button" aria-label={`${who} ${label} up`} disabled={value >= max} onClick={() => onChange(value + 1)}>
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
      <Step who={c.short} label="HP" tone="hp" value={c.hp} max={c.health} showLabel={showLabels} onChange={(v) => set('hp', v)} />
      <Step who={c.short} label="EN" tone="en" value={c.entropy} max={c.entropy_max} showLabel={showLabels} onChange={(v) => set('entropy', v)} />
    </>
  )
}

export const itemAria = (e: InvEntry) => e.item.name + (e.item.counted ? `, ${e.count ?? 0}` : '') + (e.new ? ', not looked at yet' : '')

/**
 * One pocket: the icon, NEW until its holder has looked, the amount on a counted item, and × to take it back.
 * Hover or focus shows the item as its holder sees it (`tip`). `button` makes the icon a button (the GM tab
 * picks items up with it); `badge` off leaves the amount to a field beside it. Chrome that raises a maximum has a
 * cyan edge. `size` is the icon's, in px.
 */
export function Pocket({ e, holder, tip, button, carry, badge = true, size = 48 }: { e: InvEntry; holder: CrewMember; tip: TipBind; button?: ReactNode; carry?: boolean; badge?: boolean; size?: number }) {
  return (
    <span className={'r10-pk' + (e.new ? ' new' : '') + (carry ? ' carry' : '') + (e.item.raises ? ' chr' : '')} style={{ width: size, height: size }} {...tip(`pk:${e.uid}`, e.item, e.count)}>
      {button ?? <img src={e.item.icon} alt={itemAria(e)} className="r3-px" style={{ width: size, height: size, display: 'block' }} tabIndex={0} />}
      {badge && e.item.counted && <span className="r9-count">{e.count ?? 0}</span>}
      {e.new && <span className="r9-newtag">NEW</span>}
      <button type="button" className="r10-take" aria-label={`Take ${e.item.name} from ${holder.short}`} title="Take it back" onClick={() => void gmRun('gm.item.take', { holder: holder.id, uid: e.uid })}>
        <Cross />
      </button>
    </span>
  )
}
