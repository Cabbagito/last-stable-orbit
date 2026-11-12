import { useEffect, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { CodexButton, InspectBlock, InspectIcon, Inspector } from '../inspect/Inspector'
import { tipBeside, useItemTip, type TipAt } from '../inspect/ItemTip'
import { ring } from '../lib/ring'
import { STAT_LOOK, statIcon } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { gmRun, useGame } from '../store/game'
import { STATS, type CrewMember, type TokenView, type View } from '../types'
import { ChromeMenu, GivePicker } from './Pickers'
import { Cross, ENTROPY_CAP, Eye, HEALTH_CAP, Pocket, byShelf } from './parts'
import { ViewAs } from './ViewAs'

const KEEP = '.app-card' // a click on the card doesn't close the menu it opened
const TIP_ID = 'app-cardtip'
const MOST = { health: 'health', entropy: 'Entropy' }

/**
 * The GM's card for one of the crew (the "GM crew card and Pockets" canvas, card C). HP and Entropy, each with the
 * most they can have; their dice, to read; their Burn; their skills and chrome, with a + that opens the chrome menu;
 * and what they hold, with a + that opens Give. Nothing here rolls or burns for them.
 */
export function CrewCard({ view, c, t }: { view: View; c: CrewMember; t: TokenView }) {
  const setMapPicker = useGame((s) => s.setMapPicker)
  const [menu, setMenu] = useState<'give' | 'chrome' | null>(null)
  const [most, setMost] = useState<'health' | 'entropy' | null>(null)
  const [seeing, setSeeing] = useState(false)
  const [row, setRow] = useState<{ key: string; at: TipAt } | null>(null)
  const { bind: tip, tip: itemTip } = useItemTip()
  useEffect(() => {
    setMenu(null)
    setMost(null)
  }, [c.id])

  const pockets = byShelf(view.inventory[c.id] ?? [], view.shelves ?? [])
  const set = (field: 'hp' | 'entropy', v: number) => void gmRun('gm.vitals.set', { char: c.id, [field]: v })
  const setMax = (field: 'health' | 'entropy', v: number) => void gmRun('gm.vitals.max', { char: c.id, [field]: v })
  const hover = (key: string) => {
    const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => setRow({ key, at: tipBeside(e.currentTarget) })
    const hide = () => setRow((r) => (r?.key === key ? null : r))
    return { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, tabIndex: 0, 'aria-describedby': row?.key === key ? TIP_ID : undefined }
  }
  // beside the card, between it and the GM's column
  const menuAt = (widest: number): CSSProperties => ({ right: 372, top: 64, width: `min(${widest}px, max(420px, calc(100vw - 728px)))`, maxHeight: 'calc(100% - 80px)' })
  const tops = { health: c.health, entropy: c.entropy_max }

  return (
    <div className="app-ins cc">
      <div className="app-ins-top">
        <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 84, 10, c.health, c.entropy_max)} size={84} />
        <div className="app-ins-meta">
          <span className="r4-lab">CREW · {c.role.toUpperCase()}</span>
          <span className="app-ins-name">{c.name}</span>
        </div>
      </div>
      <div className="cc-acts">
        {t.codex && <CodexButton entry={t.codex} />}
        <button type="button" className="r4-btn app-small cc-eye" title={`See ${c.short}'s screen`} aria-label={`See ${c.short}'s screen`} onClick={() => setSeeing(true)}>
          <Eye off={false} size={14} />
          Screen
        </button>
        <button type="button" className="r4-btn app-small" onClick={() => void gmRun('gm.token.hide', { token: t.id, hidden: !t.hidden })}>
          {t.hidden ? 'Show' : 'Hide'}
        </button>
        <button type="button" className="r4-btn app-small" onClick={() => setMapPicker({ token: t.id })}>
          Send to…
        </button>
      </div>
      {t.hidden && <div className="r10-warn cc-hidden">HIDDEN FROM PLAYERS</div>}

      <div className="cc-blk cc-vit">
        <Vital who={c.short} label="HP" tone="hp" value={c.hp} max={c.health} open={most === 'health'} onChange={(v) => set('hp', v)} onMax={() => setMost(most === 'health' ? null : 'health')} />
        <Vital who={c.short} label="EN" tone="en" value={c.entropy} max={c.entropy_max} open={most === 'entropy'} onChange={(v) => set('entropy', v)} onMax={() => setMost(most === 'entropy' ? null : 'entropy')} />
      </div>
      {most && (
        <div className="cc-most" role="group" aria-label={`The most ${MOST[most]} ${c.short} can have`}>
          <span className="r4-lab">THE MOST {MOST[most].toUpperCase()} {c.short.toUpperCase()} CAN HAVE</span>
          <button type="button" className="r10-sq cc-sm" aria-label={`${c.short}'s most ${MOST[most]} down`} disabled={tops[most] <= 1} onClick={() => setMax(most, tops[most] - 1)}>
            −
          </button>
          <span className={`r10-num r9-${most === 'health' ? 'hp' : 'en'}`}>{tops[most]}</span>
          <button type="button" className="r10-sq cc-sm" aria-label={`${c.short}'s most ${MOST[most]} up`} disabled={tops[most] >= (most === 'health' ? HEALTH_CAP : ENTROPY_CAP)} onClick={() => setMax(most, tops[most] + 1)}>
            +
          </button>
        </div>
      )}

      <div className="cc-blk">
        <div className="r12-rgrid cc-stats" role="group" aria-label={`${c.short}'s dice`}>
          {STATS.map((s) => (
            <div key={s} className="cc-stat" style={{ '--c': STAT_LOOK[s].col } as CSSProperties}>
              <img src={statIcon(s)} alt="" className="r3-px" />
              <span className="r12-rtxt">
                <span className="r12-rname">{STAT_LOOK[s].title}</span>
                <span className="r12-rdie">d{c.stats[s]}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {c.burn && (
        <div className="cc-blk">
          <div className="cc-row first" {...hover('burn')}>
            {c.burn.icon ? <img src={c.burn.icon} alt="" className="r3-px" /> : <span className="cc-noicon" />}
            <span className="cc-grow">{c.burn.name}</span>
            <span className="cc-tag burn">BURN</span>
          </div>
        </div>
      )}

      <div className="cc-blk">
        <div className="cc-blkh">
          <span className="r4-lab">SKILLS AND CHROME</span>
          <button type="button" className={'r10-sq cc-sm' + (menu === 'chrome' ? ' on' : '')} aria-label={`Install chrome on ${c.short}`} title="Install chrome" aria-expanded={menu === 'chrome'} onClick={() => setMenu(menu === 'chrome' ? null : 'chrome')}>
            +
          </button>
        </div>
        {c.list.map((k, i) => (
          <div key={k.item ?? k.name} className="cc-row" {...hover(`row:${i}`)}>
            {k.icon ? <img src={k.icon} alt="" className="r3-px" /> : <span className="cc-noicon" />}
            <span className="cc-grow">{k.name}</span>
            {k.kind === 'chrome' && <span className="cc-tag chrome">CHROME</span>}
            {k.item && (
              <button type="button" className="gx-x" aria-label={`Take ${k.name} off ${c.short}`} title="Take it out" onClick={() => void gmRun('gm.chrome.remove', { char: c.id, item: k.item })}>
                <Cross />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="cc-blk">
        <div className="cc-blkh">
          <span className="r4-lab">ON HAND · {pockets.length}</span>
        </div>
        <div className="r10-pkrow cc-pk">
          {pockets.map((e) => (
            <Pocket key={e.uid} e={e} holder={c} tip={tip} size={36} />
          ))}
          <button type="button" className={'cc-add' + (menu === 'give' ? ' on' : '')} aria-label={`Give ${c.short} something`} title="Give something" aria-expanded={menu === 'give'} onClick={() => setMenu(menu === 'give' ? null : 'give')}>
            +
          </button>
        </div>
      </div>

      {itemTip}
      {row && <RowTip c={c} row={row} />}
      {menu === 'give' && <GivePicker to={c} view={view} style={menuAt(900)} keep={KEEP} onClose={() => setMenu(null)} />}
      {menu === 'chrome' && <ChromeMenu to={c} view={view} style={menuAt(680)} keep={KEEP} onClose={() => setMenu(null)} />}
      {seeing && createPortal(<ViewAs who={c} onClose={() => setSeeing(false)} />, document.querySelector('.r4') ?? document.body)}
    </div>
  )
}

/** − value + for what they have, then the most they can have: click that to change it. */
function Vital({ who, label, tone, value, max, open, onChange, onMax }: { who: string; label: 'HP' | 'EN'; tone: 'hp' | 'en'; value: number; max: number; open: boolean; onChange: (v: number) => void; onMax: () => void }) {
  return (
    <div className="r10-step" role="group" aria-label={`${who} ${label}`}>
      <span className="r4-lab">{label}</span>
      <button type="button" className="r10-sq" aria-label={`${who} ${label} down`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className={`r10-num r9-${tone}`}>{value}</span>
      <button type="button" className="r10-sq" aria-label={`${who} ${label} up`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
      <button type="button" className={'cc-max' + (open ? ' on' : '')} aria-expanded={open} aria-label={`The most ${label} ${who} can have is ${max}. Change it`} title="Change the most they can have" onClick={onMax}>
        /{max}
      </button>
    </div>
  )
}

/** What a row says on their sheet, beside the card: the Burn, a skill and its downside, or a piece of chrome. */
function RowTip({ c, row }: { c: CrewMember; row: { key: string; at: TipAt } }) {
  const at = { id: TIP_ID, role: 'tooltip', className: 'app-sheettip ' + row.at.side, style: row.at.style }
  if (row.key === 'burn' && c.burn) {
    const b = c.burn
    return (
      <Inspector {...at} label="BURN" name={b.name} media={<InspectIcon src={b.icon} fallback="BURN" />} sub={<span className="app-ins-sub">{b.when}</span>}>
        <div className="app-ins-txt">{b.text}</div>
      </Inspector>
    )
  }
  const k = c.list[Number(row.key.slice('row:'.length))]
  if (!k) return null
  const chrome = k.kind === 'chrome'
  return (
    <Inspector {...at} label={chrome ? 'CHROME' : 'SKILL'} name={k.name} media={<InspectIcon src={k.icon} fallback={chrome ? 'CHROME' : 'SKILL'} />}>
      {k.text && <div className="app-ins-txt">{k.text}</div>}
      {k.downside && (
        <InspectBlock label="IF THE ROLL FAILS" tone="down">
          <div className="app-ins-txt">{k.downside}</div>
        </InspectBlock>
      )}
    </Inspector>
  )
}
