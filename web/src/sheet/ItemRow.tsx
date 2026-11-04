import { useEffect } from 'react'
import type { Anchor } from '../inspect/anchor'
import { send } from '../store/game'
import type { InvEntry } from '../types'
import { itemLabel, shortCount } from './items'

const SEEN_AFTER = 350 // ms of looking before a new item counts as seen, so passing over it doesn't

/**
 * The sheet's "On hand" row. Hovering an item opens the inspector beside the sheet (the Sheet draws it).
 * A new item wears a pink NEW tag until its holder has looked at it for a moment.
 */
export function ItemRow({
  items,
  hover,
  onHover,
  onLeave,
}: {
  items: InvEntry[]
  hover: Anchor | null
  onHover: (key: string, el: HTMLElement) => void
  onLeave: (key: string) => void
}) {
  const looking = hover ? items.find((i) => `item:${i.uid}` === hover.key) : undefined

  useEffect(() => {
    if (!looking?.new) return
    const uid = looking.uid
    const t = window.setTimeout(() => void send('item.seen', { uid }), SEEN_AFTER)
    return () => window.clearTimeout(t)
  }, [looking?.uid, looking?.new])

  return (
    <section aria-label="On hand" className="r5-items app-items" style={{ flex: 'none' }}>
      {items.map((e) => {
        const key = `item:${e.uid}`
        return (
          <span
            key={e.uid}
            className={'app-item' + (e.new ? ' new' : '')}
            tabIndex={0}
            aria-describedby={hover?.key === key ? 'app-sheettip' : undefined}
            onMouseEnter={(ev) => onHover(key, ev.currentTarget)}
            onMouseLeave={() => onLeave(key)}
            onFocus={(ev) => onHover(key, ev.currentTarget)}
            onBlur={() => onLeave(key)}
          >
            <img src={e.item.icon} alt={itemLabel(e)} className="r3-px" style={{ width: 48, height: 48 }} />
            {e.item.counted && (
              <span className="app-itemcount" aria-hidden="true">
                {shortCount(e.count ?? 0)}
              </span>
            )}
            {e.new && (
              <span className="app-itemnew" aria-hidden="true">
                NEW
              </span>
            )}
          </span>
        )
      })}
    </section>
  )
}
