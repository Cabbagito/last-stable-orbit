import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { send } from '../store/game'
import type { InvEntry, Item } from '../types'
import { itemLabel, shortCount } from './items'

const SEEN_AFTER = 350 // ms of looking before a new item counts as seen, so passing over it doesn't

const KIND_LABEL: Partial<Record<Item['kind'], string>> = {
  note: 'NOTE',
  audio: 'AUDIO LOG',
  key: 'KEY',
  weapon: 'WEAPON',
  tool: 'TOOL',
}

interface Tip {
  uid: string
  x: number // caret, from the row's left edge
  bottom: number // the panel's bottom edge, from the row's bottom edge
}

/**
 * The sheet's "On hand" row. One R6-style panel above the row (it spans the row, so the scrolling column
 * never clips it) holds the hovered item's name and text, with a caret pointing at it. A new item wears
 * a pink NEW tag until its holder has looked at it for a moment.
 */
export function ItemRow({ items }: { items: InvEntry[] }) {
  const row = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const shown = tip ? items.find((i) => i.uid === tip.uid) : undefined

  useEffect(() => {
    if (!shown?.new) return
    const uid = shown.uid
    const t = window.setTimeout(() => void send('item.seen', { uid }), SEEN_AFTER)
    return () => window.clearTimeout(t)
  }, [shown?.uid, shown?.new])

  const open = (uid: string, el: HTMLElement) => {
    const h = row.current?.offsetHeight ?? 0
    setTip({ uid, x: el.offsetLeft + el.offsetWidth / 2, bottom: h - el.offsetTop + 8 })
  }
  const close = (uid: string) => setTip((t) => (t?.uid === uid ? null : t))

  return (
    <section ref={row} aria-label="On hand" className="r5-items app-items" style={{ flex: 'none' }}>
      {items.map((e) => (
        <span
          key={e.uid}
          className={'app-item' + (e.new ? ' new' : '')}
          tabIndex={0}
          aria-describedby={tip?.uid === e.uid ? 'app-itemtip' : undefined}
          onMouseEnter={(ev) => open(e.uid, ev.currentTarget)}
          onMouseLeave={() => close(e.uid)}
          onFocus={(ev) => open(e.uid, ev.currentTarget)}
          onBlur={() => close(e.uid)}
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
      ))}
      <div
        id="app-itemtip"
        role="tooltip"
        className={'app-itemtip' + (shown ? ' on' : '')}
        style={tip ? ({ '--x': `${tip.x}px`, bottom: tip.bottom } as CSSProperties) : undefined}
      >
        {shown && (
          <>
            <div className="app-itemtip-head">
              <span className="app-itemtip-name">{shown.item.name}</span>
              {shown.item.counted ? (
                <span className="app-itemtip-count">{(shown.count ?? 0).toLocaleString('en-US')}</span>
              ) : (
                KIND_LABEL[shown.item.kind] && <span className="r4-lab">{KIND_LABEL[shown.item.kind]}</span>
              )}
            </div>
            {shown.item.text && <div className="app-itemtip-text">{shown.item.text}</div>}
          </>
        )}
      </div>
    </section>
  )
}
