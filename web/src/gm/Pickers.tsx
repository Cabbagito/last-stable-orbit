import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useItemTip, type TipBind } from '../inspect/ItemTip'
import { gmRun } from '../store/game'
import type { CrewMember, Item, View } from '../types'
import { Cross, GIVE_COUNTED, onShelf } from './parts'

// The two menus a crew card opens (the "GM crew card and Pockets" canvas, card C): Give, from the + after On hand,
// and Install chrome, from the + beside Skills. The Pockets page opens the chrome menu too.

/**
 * A menu over the page: a title, a line under it, and a close. Escape closes it, and so does a click anywhere else,
 * except inside `keep` (a CSS selector: the card that opened it).
 */
function Pop({ title, hint, style, keep, onClose, className = '', children }: { title: string; hint: string; style: CSSProperties; keep?: string; onClose: () => void; className?: string; children: ReactNode }) {
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (!box.current?.contains(t) && !(keep && t.closest?.(keep))) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [keep, onClose])
  return createPortal(
    <section ref={box} className={'gx-pop pk-pop ' + className} role="dialog" aria-label={title} style={style}>
      <div className="gx-poph">
        <span className="r4-name">{title}</span>
        <span className="r5-role">{hint}</span>
        <button type="button" className="gx-x" aria-label="Close" onClick={onClose}>
          <Cross />
        </button>
      </div>
      {children}
    </section>,
    document.querySelector('.r4') ?? document.body,
  )
}

/** One thing in a menu: its icon, its name, and a few words at the right. Hover or focus shows it as its holder would see it. */
function Row({ it, note, tip, tipKey, disabled, onClick, label }: { it: Item; note?: string; tip: TipBind; tipKey: string; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="pk-it" aria-label={label} disabled={disabled} onClick={onClick} {...tip(tipKey, it)}>
      <img src={it.icon} alt="" className="r3-px" />
      <span className="pk-itn">{it.name}</span>
      {note && <span className="pk-note">{note}</span>}
    </button>
  )
}

/**
 * Everything there is to hand to `to`, by name, in the shelves' groups. It stays open, so a few things can go over.
 * Draw hands over one of a group, picked by the server. Chrome isn't here: it has its own menu.
 */
export function GivePicker({ to, view, style, keep, onClose }: { to: CrewMember; view: View; style: CSSProperties; keep?: string; onClose: () => void }) {
  const { bind: tip, tip: itemTip } = useItemTip()
  const items = view.items ?? []
  const has = new Set((view.inventory[to.id] ?? []).map((e) => e.item.id))
  return (
    <Pop title={`Give ${to.short}…`} hint="It stays open, so you can hand over a few. Draw one picks from its group for you." style={style} keep={keep} onClose={onClose}>
      {items
        .filter((it) => it.counted && it.shelf)
        .map((it) => (
          <Amount key={it.id} it={it} to={to} />
        ))}
      <div className="pk-cols">
        {(view.shelves ?? []).map((sh) => {
          const rows = onShelf(items, sh).filter((it) => !it.counted)
          if (!rows.length) return null
          return (
            <div key={sh.id} className="pk-shelf" role="group" aria-label={sh.name}>
              <div className="pk-sh">
                <span className="r5-sec">{sh.name}</span>
                {sh.draw && (
                  <button type="button" className="gx-mini" title={`Hands ${to.short} one of these, picked at random`} aria-label={`Draw one from ${sh.name} for ${to.short}`} onClick={() => void gmRun('gm.item.draw', { holder: to.id, shelf: sh.id })}>
                    Draw one
                  </button>
                )}
              </div>
              {rows.map((it) => (
                <Row key={it.id} it={it} tip={tip} tipKey={`give:${it.id}`} note={has.has(it.id) ? 'has it' : undefined} label={`Give ${to.short} ${it.name}`} onClick={() => void gmRun('gm.item.give', { holder: to.id, item: it.id })} />
              ))}
            </div>
          )
        })}
      </div>
      {itemTip}
    </Pop>
  )
}

/** A counted item (credits): an amount, and Give. */
function Amount({ it, to }: { it: Item; to: CrewMember }) {
  const [v, setV] = useState(String(GIVE_COUNTED))
  const n = Number(v)
  const give = () => n > 0 && void gmRun('gm.item.give', { holder: to.id, item: it.id, count: n })
  return (
    <div className="pk-amt">
      <img src={it.icon} alt="" className="r3-px" />
      <label htmlFor={`pk-amt-${it.id}`}>{it.name}</label>
      <input id={`pk-amt-${it.id}`} className="app-select app-count app-pkcount" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && give()} />
      <button type="button" className="r10-btn" disabled={!(n > 0)} onClick={give}>
        Give
      </button>
    </div>
  )
}

const SHOPS: ['clinic' | 'cart', string][] = [
  ['clinic', 'The clinic'],
  ['cart', 'The knock-off cart'],
]

/**
 * Every piece of chrome, by the shop that sells it. A piece goes on `to`'s sheet as a skill. One that raises a maximum
 * goes in their pockets instead, and the maximum goes up by itself.
 */
export function ChromeMenu({ to, view, style, keep, onClose }: { to: CrewMember; view: View; style: CSSProperties; keep?: string; onClose: () => void }) {
  const { bind: tip, tip: itemTip } = useItemTip()
  const items = view.items ?? []
  const on = new Set(to.list.map((k) => k.item))
  const install = async (it: Item) => {
    const ack = await gmRun('gm.chrome.install', { char: to.id, item: it.id })
    if (ack.ok) onClose()
  }
  return (
    <Pop title={`Install chrome on ${to.short}`} hint={`A piece goes on ${to.short}'s sheet as a skill. One that raises a maximum goes in their pockets.`} style={style} keep={keep} onClose={onClose} className="pk-chrome">
      <div className="pk-shops">
        {SHOPS.map(([shop, name]) => {
          const sold = items.filter((it) => it.chrome === shop)
          const held = sold.filter((it) => it.raises)
          return (
            <div key={shop} role="group" aria-label={name}>
              <div className="pk-sh">
                <span className="r5-sec">{name}</span>
              </div>
              {sold
                .filter((it) => !it.raises)
                .map((it) => (
                  <Row key={it.id} it={it} tip={tip} tipKey={`chrome:${it.id}`} disabled={on.has(it.id)} note={on.has(it.id) ? 'on the sheet' : undefined} label={`Install ${it.name} on ${to.short}`} onClick={() => void install(it)} />
                ))}
              {held.length > 0 && (
                <div className="pk-sh pk-sh2">
                  <span className="r4-lab pk-amber">ITEMS · THE MAXIMUM GOES UP BY ITSELF</span>
                </div>
              )}
              {held.map((it) => (
                <Row key={it.id} it={it} tip={tip} tipKey={`chrome:${it.id}`} note={it.raises === 'health' ? '+1 max health' : '+1 max Entropy'} label={`Give ${to.short} ${it.name}`} onClick={() => void install(it)} />
              ))}
            </div>
          )
        })}
      </div>
      {itemTip}
    </Pop>
  )
}
