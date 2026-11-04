import { useState } from 'react'
import { anchorOf, anchorStyle, type Anchor } from '../inspect/anchor'
import { InspectBlock, InspectIcon, Inspector } from '../inspect/Inspector'
import { ItemInspector } from '../inspect/ItemTip'
import { ring } from '../lib/ring'
import { STAT_LOOK } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { useGame } from '../store/game'
import { ItemRow } from './ItemRow'
import { STATS, type CrewMember, type InvEntry } from '../types'

const STAT_NAME: Record<string, string> = {
  body: 'BODY',
  reflex: 'REFLEX',
  tech: 'TECH',
  intel: 'INTEL',
  cool: 'COOL',
  empathy: 'EMPATHY',
}

/** The R6 character sheet: portrait in its ring, name, the 3x2 stat table, skills + chrome, items. */
export function Sheet({ me, items }: { me: CrewMember; items: InvEntry[] }) {
  const openPick = useGame((s) => s.openPick)
  const [hover, setHover] = useState<Anchor | null>(null)
  const onHover = (key: string, el: HTMLElement) => setHover(anchorOf(key, el))
  const onLeave = (key: string) => setHover((h) => (h?.key === key ? null : h))
  return (
    <aside aria-label="Character sheet" className="r4-col">
      <div role="img" aria-label={`${me.short}. HP ${me.hp} of 6, Entropy ${me.entropy} of 6`} style={{ alignSelf: 'center' }}>
        <RingPortrait src={me.portrait} ring={ring(me.hp, me.entropy, 216, 12)} size={216} />
      </div>
      <div style={{ flex: 'none' }}>
        <div className="r4-name">{me.name}</div>
        <div className="r5-role">{me.role}</div>
      </div>
      <section aria-label="Stats" className="r5-table" style={{ flex: 'none' }}>
        {STATS.map((s) => {
          const die = me.stats[s]
          return (
            <button key={s} type="button" className="r5-cell" aria-label={`Roll ${STAT_LOOK[s].title}, d${die}`} onClick={() => openPick(s)}>
              <span style={{ display: 'flex' }}>
                <img src={`/assets/icons/stats/${s}.png`} alt="" className="r3-px" style={{ width: 48, height: 48 }} />
                <img src={`/assets/icons/dice/${s}-d${die}.png`} alt="" className="r3-px r4-sdie" style={{ width: 48, height: 48 }} />
              </span>
              <span className="r4-lab">{STAT_NAME[s]}</span>
            </button>
          )
        })}
      </section>
      <section aria-label="Skills and chrome" className="r5-rows" style={{ flex: 'none' }}>
        {me.list.map((k, i) => (
          <div
            key={k.name}
            className={'r5-row app-row' + (hover?.key === `row:${i}` ? ' on' : '')}
            tabIndex={0}
            aria-describedby={hover?.key === `row:${i}` ? 'app-sheettip' : undefined}
            onMouseEnter={(e) => onHover(`row:${i}`, e.currentTarget)}
            onMouseLeave={() => onLeave(`row:${i}`)}
            onFocus={(e) => onHover(`row:${i}`, e.currentTarget)}
            onBlur={() => onLeave(`row:${i}`)}
          >
            {k.icon ? (
              <img src={k.icon} alt="" className="r3-px" style={{ width: 48, height: 48 }} />
            ) : (
              <span className="app-noicon" aria-hidden="true">
                {k.kind === 'chrome' ? 'CHROME' : 'SKILL'}
              </span>
            )}
            <span>{k.name}</span>
          </div>
        ))}
      </section>
      <ItemRow items={items} hover={hover} onHover={onHover} onLeave={onLeave} />
      {hover && <SheetTip hover={hover} me={me} items={items} />}
    </aside>
  )
}

/** The inspector for whatever is hovered on the sheet, beside the column with its caret at the row. */
function SheetTip({ hover, me, items }: { hover: Anchor; me: CrewMember; items: InvEntry[] }) {
  const { style, side } = anchorStyle(hover)
  const at = { id: 'app-sheettip', role: 'tooltip', className: 'app-sheettip ' + side, style }
  if (hover.key.startsWith('item:')) {
    const e = items.find((i) => `item:${i.uid}` === hover.key)
    return e ? <ItemInspector id="app-sheettip" item={e.item} count={e.count} at={{ style, side }} /> : null
  }
  const k = me.list[Number(hover.key.slice('row:'.length))]
  if (!k) return null
  const chrome = k.kind === 'chrome'
  return (
    <Inspector {...at} label={chrome ? 'CHROME' : 'SKILL'} name={k.name} media={<InspectIcon src={k.icon} fallback={chrome ? 'CHROME' : 'SKILL'} />}>
      {k.text && <div className="app-ins-txt">{k.text}</div>}
      {chrome ? (
        <InspectBlock label="ON A ROLL">
          <div className="app-ins-txt">Pick it like a skill. No downside, and it can do things a person can't.</div>
        </InspectBlock>
      ) : (
        <>
          <div className="app-ins-txt">Pick it on a roll when it fits: your die steps up one size. A d20 gets +2.</div>
          {k.downside && (
            <InspectBlock label="IF THE ROLL FAILS" tone="down">
              <div className="app-ins-txt">{k.downside}</div>
            </InspectBlock>
          )}
        </>
      )}
    </Inspector>
  )
}
