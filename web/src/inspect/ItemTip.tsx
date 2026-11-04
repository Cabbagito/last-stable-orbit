import { useEffect, useState, type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import type { Item } from '../types'
import { InspectIcon, Inspector } from './Inspector'

export const KIND_LABEL: Record<Item['kind'], string> = {
  gear: 'GEAR',
  weapon: 'WEAPON',
  tool: 'TOOL',
  cash: 'CASH',
  key: 'KEY',
  note: 'NOTE',
  audio: 'AUDIO LOG',
}

export interface TipAt {
  style: CSSProperties
  side: string // the caret: cl-top / cl-bot, plus pt-r when it points right
}

/**
 * An item as its holder sees it on their sheet (Round 9's inspector): the icon at 2x, its kind, its name, an
 * amount for credits, and its text. `sub` replaces the amount (the Give row shows what it would add).
 */
export function ItemInspector({ item, count, sub, at, id }: { item: Item; count?: number | null; sub?: ReactNode; at: TipAt; id: string }) {
  return (
    <Inspector
      id={id}
      role="tooltip"
      className={'app-sheettip ' + at.side}
      style={at.style}
      label={KIND_LABEL[item.kind]}
      name={item.name}
      media={<InspectIcon src={item.icon} fallback="ITEM" />}
      sub={sub ?? (item.counted ? <span className="app-ins-num">{(count ?? 0).toLocaleString('en-US')}</span> : undefined)}
    >
      {item.text && <div className="app-ins-txt">{item.text}</div>}
    </Inspector>
  )
}

const CARET = 46 // the caret's middle, from the inspector's top (or bottom) edge
const EDGE = 8
const WIDTH = 300
const GAP = 10

/**
 * Beside the hovered thing, pointing at it: left of a card on the map (so it never covers the card), else to
 * the thing's right, or its left when there's no room. Low on the screen it grows upward.
 */
export function tipBeside(el: HTMLElement): TipAt {
  const r = el.getBoundingClientRect()
  const card = el.closest('.app-card')?.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let style: CSSProperties
  let side = ''
  if (card) {
    style = { right: vw - card.left + GAP }
    side = 'pt-r'
  } else if (r.right + GAP + WIDTH <= vw - EDGE) {
    style = { left: r.right + GAP }
  } else {
    style = { right: vw - r.left + GAP }
    side = 'pt-r'
  }
  const y = r.top + r.height / 2
  if (y > vh * 0.55) return { style: { ...style, bottom: Math.max(EDGE, vh - y - CARET) }, side: side + ' cl-bot' }
  return { style: { ...style, top: Math.max(EDGE, y - CARET) }, side: side + ' cl-top' }
}

const TIP_ID = 'app-itemtip'

type Hovered = { key: string; el: HTMLElement; at: TipAt; item: Item; count?: number | null; sub?: ReactNode }

/**
 * Hover or focus an item to see it as its holder would. `bind(key, item)` goes on the thing you hover; render
 * `tip` anywhere.
 */
export function useItemTip() {
  const [h, setH] = useState<Hovered | null>(null)
  // the item was taken or moved while you were on it: no mouseleave ever comes, so drop the tip
  useEffect(() => {
    if (h && !h.el.isConnected) setH(null)
  })
  const bind = (key: string, item: Item, count?: number | null, sub?: ReactNode) => {
    const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => setH({ key, el: e.currentTarget, at: tipBeside(e.currentTarget), item, count, sub })
    const hide = () => setH((x) => (x?.key === key ? null : x))
    return { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, 'aria-describedby': h?.key === key ? TIP_ID : undefined }
  }
  const tip = h ? <ItemInspector id={TIP_ID} item={h.item} count={h.count} sub={h.sub} at={h.at} /> : null
  return { bind, tip, close: () => setH(null) }
}

export type TipBind = ReturnType<typeof useItemTip>['bind']
