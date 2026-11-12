import { useEffect, useState, type DragEvent } from 'react'
import { Bench, Seats } from '../gm/Bench'
import { CodexSection } from '../gm/CodexSection'
import { EventsSection } from '../gm/EventsSection'
import { liveSwitches, pressSwitch, switchLabel } from '../gm/MoodBar'
import { crewFaces, isFar, moodArt } from '../gm/mapTiles'
import { Diamond, ENTROPY_CAP, Eye, GIVE_COUNTED, HEALTH_CAP, Pocket, Step, byShelf, itemAria, onShelf } from '../gm/parts'
import { ChromeMenu } from '../gm/Pickers'
import { SendCrew } from '../gm/SendCrew'
import { CutscenesSection, TvSection } from '../gm/StageSections'
import { ViewAs } from '../gm/ViewAs'
import { useItemTip, type TipBind } from '../inspect/ItemTip'
import { ring } from '../lib/ring'
import { RingPortrait } from '../shell/RingPortrait'
import { gmRun, useGame } from '../store/game'
import type { CrewMember, InvEntry, Item, MapView, View } from '../types'

type Section = 'pockets' | 'show' | 'maps' | 'codex' | 'acts' | 'bench' | 'seats'

const SECTIONS: [Section, string][] = [
  ['pockets', 'Pockets'],
  ['show', 'On screen'],
  ['maps', 'Maps'],
  ['codex', 'Codex'],
  ['acts', 'Acts'],
]
const SANDBOX: [Section, string][] = [
  ['bench', 'Bench'],
  ['seats', 'Seats'],
]

/** `#gm/maps`: the section is in the URL, so a reload keeps your place. */
function useSection(all: [Section, string][]): Section {
  const read = () => {
    const s = location.hash.slice(1).split('/')[1] as Section
    return all.some(([id]) => id === s) ? s : 'pockets'
  }
  const [section, setSection] = useState(read)
  useEffect(() => {
    const on = () => setSection(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  })
  return section
}

/** The GM tab: what you do between scenes, five short pages (and in the sandbox, the Bench). */
export function GmTab() {
  const view = useGame((s) => s.view)
  const gmError = useGame((s) => s.gmError)
  const all = view?.bench ? [...SECTIONS, ...SANDBOX] : SECTIONS
  const section = useSection(all)
  const [viewAs, setViewAs] = useState<string | null>(null)
  if (!view) return <div className="app-body app-wait">Docking…</div>
  const seeing = viewAs ? view.crew.find((c) => c.id === viewAs) : undefined

  return (
    <div className="gx-tab">
      <div className="gx-subrow">
        <nav className="r10-mood gx-sub" aria-label="GM tab">
          {all.map(([id, name]) => (
            <a key={id} className={section === id ? 'on' : ''} aria-current={section === id ? 'page' : undefined} href={`#gm/${id}`}>
              {name}
            </a>
          ))}
        </nav>
        {gmError && (
          <div className="app-error" role="alert">
            {gmError}
          </div>
        )}
      </div>
      <div className="gx-body">
        {section === 'pockets' && <PocketsSection view={view} onView={setViewAs} />}
        {section === 'show' && <OnScreen view={view} />}
        {section === 'maps' && <MapsSection view={view} />}
        {section === 'codex' && <CodexSection view={view} />}
        {section === 'acts' && <ActsSection view={view} />}
        {section === 'bench' && view.bench && <Bench view={view} bench={view.bench} />}
        {section === 'seats' && view.bench && <Seats view={view} />}
      </div>
      {seeing && <ViewAs who={seeing} onClose={() => setViewAs(null)} />}
    </div>
  )
}

/** What you're holding: something from a pocket, something off the shelf, or one yet to be drawn from a group. */
type Carry = { holder: string; uid: string } | { item: string } | { draw: string } | null
const DRAG_TYPE = 'application/x-lso-item'

/**
 * Everyone's pockets, with one shelf of everything there is to hand out above them, in its groups (the "GM crew card
 * and Pockets" canvas, Pockets A). Pick something up, then click who gets it, or drag it onto them. Draw carries one
 * of its group, picked by the server when it's handed over. Each row also has the most health and Entropy they can
 * have, and their chrome.
 */
function PocketsSection({ view, onView }: { view: View; onView: (id: string) => void }) {
  const [carry, setCarry] = useState<Carry>(null)
  const [over, setOver] = useState<string | null>(null)
  const [chromeFor, setChromeFor] = useState<string | null>(null)
  const { bind: tip, tip: itemTip } = useItemTip()
  const items = view.items ?? []
  const shelves = view.shelves ?? []
  const carriedItem = carry && 'item' in carry ? items.find((i) => i.id === carry.item) : undefined
  const carriedEntry = carry && 'uid' in carry ? (view.inventory[carry.holder] ?? []).find((e) => e.uid === carry.uid) : undefined
  const drawn = carry && 'draw' in carry ? shelves.find((s) => s.id === carry.draw) : undefined
  const carriedName = carriedItem?.name ?? carriedEntry?.item.name ?? drawn?.name
  useEffect(() => {
    if (carry && !carriedName) setCarry(null) // it was taken or moved elsewhere
  }, [carry, carriedName])

  const hand = (to: string, what: Carry = carry) => {
    if (what && 'draw' in what) {
      void gmRun('gm.item.draw', { holder: to, shelf: what.draw })
    } else if (what && 'item' in what) {
      const it = items.find((i) => i.id === what.item)
      if (it) void gmRun('gm.item.give', it.counted ? { holder: to, item: it.id, count: GIVE_COUNTED } : { holder: to, item: it.id })
    } else if (what && what.holder !== to) {
      void gmRun('gm.item.move', { holder: what.holder, uid: what.uid, to })
    }
    setCarry(null)
  }
  const line = drawn
    ? `Carrying one from ${drawn.name}, picked when you hand it over.`
    : carriedName
      ? `Carrying ${carriedName}. Hand it to someone below.`
      : 'Pick something up, then click who gets it, or drag it onto them. Draw picks one of its group for you. The × takes it back.'
  const dragProps = (c: CrewMember) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      setOver(c.id)
    },
    onDragLeave: () => setOver((o) => (o === c.id ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setOver(null)
      try {
        hand(c.id, JSON.parse(e.dataTransfer.getData(DRAG_TYPE)))
      } catch {
        /* not one of ours */
      }
    },
  })
  const setMax = (c: CrewMember, field: 'health' | 'entropy', v: number) => void gmRun('gm.vitals.max', { char: c.id, [field]: v })
  const chromeOn = view.crew.find((c) => c.id === chromeFor)

  return (
    <section aria-label="Pockets">
      <div className="gx-shelf">
        <div className="gx-shelfh">
          <span className="r5-sec">Hand out</span>
          <span className="r10-hint" aria-live="polite">
            {line}
          </span>
        </div>
        <div className="gx-groups">
          {shelves.map((sh) => {
            const its = onShelf(items, sh)
            if (!its.length) return null
            const drawing = !!carry && 'draw' in carry && carry.draw === sh.id
            return (
              <div key={sh.id} className="gx-group" role="group" aria-label={sh.name}>
                <div className="gx-grouph">
                  <span className="r5-sec">{sh.name}</span>
                  {sh.draw && (
                    <button type="button" className={'gx-mini' + (drawing ? ' on' : '')} aria-pressed={drawing} aria-label={`Draw one from ${sh.name}`} title="Carry one of these, picked at random when you hand it over" onClick={() => setCarry(drawing ? null : { draw: sh.id })}>
                      Draw
                    </button>
                  )}
                </div>
                <div className="r10-give">
                  {its.map((it) => (
                    <ShelfItem key={it.id} it={it} on={!!carry && 'item' in carry && carry.item === it.id} tip={tip} toggle={() => setCarry(carry && 'item' in carry && carry.item === it.id ? null : { item: it.id })} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="gx-ptable">
        <div className="gx-prow gx-phead" aria-hidden="true">
          <span className="r5-sec">Crew</span>
          <span className="r5-sec">Max health</span>
          <span className="r5-sec">Max Entropy</span>
          <span className="r5-sec">Chrome</span>
          <span className="r5-sec">On hand</span>
          <span />
        </div>
        {view.crew.map((c) => {
          const pockets = byShelf(view.inventory[c.id] ?? [], shelves)
          const target = !!carry && !('holder' in carry && carry.holder === c.id)
          return (
            <div key={c.id} className={'gx-prow' + (target ? ' target' : '') + (over === c.id ? ' over' : '')} {...dragProps(c)}>
              <div className="r10-who2">
                <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 56, 8, c.health, c.entropy_max)} size={56} />
                <span style={{ minWidth: 0 }}>
                  <span className="r10-cname">{c.name}</span>
                  <br />
                  <span className="r5-role">{c.role}</span>
                </span>
              </div>
              <Step who={`${c.short}'s most`} label="HP" tone="hp" value={c.health} max={HEALTH_CAP} showLabel={false} onChange={(v) => setMax(c, 'health', v)} />
              <Step who={`${c.short}'s most`} label="EN" tone="en" value={c.entropy_max} max={ENTROPY_CAP} showLabel={false} onChange={(v) => setMax(c, 'entropy', v)} />
              <div className="gx-chrome">
                {c.list
                  .filter((k) => k.item)
                  .map((k) => (
                    <img key={k.item} src={k.icon ?? ''} alt={k.name} title={k.name} className="r3-px" />
                  ))}
                <button type="button" className={'r10-sq cc-sm' + (chromeFor === c.id ? ' on' : '')} aria-label={`Install chrome on ${c.short}`} title="Install chrome" aria-expanded={chromeFor === c.id} onClick={() => setChromeFor(chromeFor === c.id ? null : c.id)}>
                  +
                </button>
              </div>
              <div className="r10-pkrow" role="group" aria-label={`${c.short}'s pockets`}>
                {pockets.map((e) => (
                  <CrewPocket key={e.uid} e={e} c={c} carry={carry} setCarry={setCarry} tip={tip} />
                ))}
                {pockets.length === 0 && <span className="r10-dimtxt">Nothing.</span>}
              </div>
              <div className="r10-acts2">
                {target && (
                  <button type="button" className="r10-btn on" onClick={() => hand(c.id)}>
                    Hand it to {c.short}
                  </button>
                )}
                <button type="button" className="r10-btn" aria-label={`See ${c.short}'s screen`} title={`See ${c.short}'s screen`} onClick={() => onView(c.id)}>
                  <Eye off={false} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {itemTip}
      {chromeOn && <ChromeMenu to={chromeOn} view={view} keep=".gx-chrome" style={{ left: '50%', top: 120, transform: 'translateX(-50%)', width: 'min(680px, calc(100vw - 48px))' }} onClose={() => setChromeFor(null)} />}
    </section>
  )
}

function ShelfItem({ it, on, tip, toggle }: { it: Item; on: boolean; tip: TipBind; toggle: () => void }) {
  return (
    <button
      type="button"
      className={'r10-gv gx-gv' + (on ? ' on' : '')}
      aria-label={`Pick up ${it.name}` + (it.counted ? `, ${GIVE_COUNTED}` : '')}
      aria-pressed={on}
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ item: it.id }))
        ev.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={toggle}
      {...tip(`shelf:${it.id}`, it, null, it.counted ? <span className="app-ins-num">+{GIVE_COUNTED}</span> : undefined)}
    >
      <img src={it.icon} alt="" className="r3-px" />
    </button>
  )
}

/** A pocket in the table: click to pick it up, drag it onto someone, and type a new amount for credits. */
function CrewPocket({ e, c, carry, setCarry, tip }: { e: InvEntry; c: CrewMember; carry: Carry; setCarry: (c: Carry) => void; tip: TipBind }) {
  const on = !!carry && 'holder' in carry && carry.holder === c.id && carry.uid === e.uid
  return (
    <>
      <Pocket
        e={e}
        holder={c}
        tip={tip}
        carry={on}
        badge={!e.item.counted}
        button={
          <button
            type="button"
            className="r10-pkb"
            aria-label={(on ? 'Put back ' : 'Pick up ') + itemAria(e)}
            aria-pressed={on}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ holder: c.id, uid: e.uid }))
              ev.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => setCarry(on ? null : { holder: c.id, uid: e.uid })}
          >
            <img src={e.item.icon} alt="" className="r3-px" />
          </button>
        }
      />
      {e.item.counted && <CountInput value={e.count ?? 0} label={`${c.short}'s ${e.item.name.toLowerCase()}`} onCommit={(count) => void gmRun('gm.item.count', { holder: c.id, uid: e.uid, count })} />}
    </>
  )
}

/** An amount you type: sent on Enter or when you leave the field. */
function CountInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Number(v)
    if (v !== '' && Number.isInteger(n) && n !== value) onCommit(n)
    else setV(String(value))
  }
  return (
    <input
      className="app-select app-count app-pkcount"
      inputMode="numeric"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** Everything you put on people's screens: films, little games, and the TV. */
function OnScreen({ view }: { view: View }) {
  return (
    <div className="gx-show">
      <CutscenesSection view={view} />
      <div className="gx-showcol">
        <TvSection view={view} />
        <EventsSection view={view} />
      </div>
    </div>
  )
}

/** Every map on one page, in the picker's three places: its mood, who's there, and its things and switches a click away. */
function MapsSection({ view }: { view: View }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-label="Maps">
      {(view.map_groups ?? []).map((g) => (
        <div key={g.title}>
          <div className="r5-sec gx-mgroup">{g.title}</div>
          {g.maps.map(({ id, under }) => {
            const m = view.maps[id]
            return m ? <MapRow key={id} view={view} m={m} under={under} open={open === id} toggle={() => setOpen(open === id ? null : id)} /> : null
          })}
        </div>
      ))}
    </section>
  )
}

function MapRow({ view, m, under, open, toggle }: { view: View; m: MapView; under: number; open: boolean; toggle: () => void }) {
  const setGmMap = useGame((s) => s.setGmMap)
  const shown = m.objects.filter((o) => o.shown).length
  const sws = liveSwitches(m)
  const fight = view.fights?.find((f) => f.map === m.id)
  const openIt = () => {
    setGmMap(m.id)
    location.hash = `scene/${m.id}`
  }
  const npcs = Object.values(view.tokens).filter((t) => t.map === m.id && t.kind === 'npc')
  return (
    <>
      <div className={'gx-mrow' + (view.party_map === m.id ? ' party' : '') + (isFar(view, m.id) ? ' far' : '')}>
        <button type="button" className="gx-mopen" style={{ paddingLeft: under * 18 }} onClick={openIt} title="Open it on the Scene">
          <img src={moodArt(m)} alt="" loading="lazy" />
          <span className="gx-mname">
            <b>{m.name}</b>
            <small>
              {m.subtitle}
              {view.party_map === m.id ? " · the party's map" : ''}
            </small>
          </span>
        </button>
        <span className="gx-faces">
          {crewFaces(view, m.id).map((t) => (
            <img key={t.id} src={t.portrait} alt={t.name} title={t.name} className={'r3-px' + (t.hidden ? ' off' : '')} style={{ boxShadow: `0 0 0 1px ${t.color}` }} />
          ))}
          {npcs.length > 0 && <span className="r10-dimtxt gx-plus">+{npcs.length}</span>}
          {fight && <span className="r12-tag">FIGHT</span>}
        </span>
        <div>
          {m.moods.length > 1 && (
            <div className="r10-mood gx-mmood" role="group" aria-label={`${m.name}: mood`}>
              {m.moods.map((x) => (
                <button key={x.id} type="button" className={m.mood === x.id ? 'on' : ''} aria-pressed={m.mood === x.id} onClick={() => void gmRun('gm.map.mood', { map: m.id, mood: x.id })}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="gx-things" aria-expanded={open} onClick={toggle}>
          {shown} of {m.objects.length} shown ⌄
        </button>
        <div className="gx-macts">
          <SendCrew view={view} map={m} quiet />
        </div>
      </div>
      {open && (
        <div className="gx-mopenrow">
          {sws.length > 0 && (
            <div className="r10-go" style={{ flexWrap: 'wrap' }}>
              {sws.map((sw) => {
                const v = m.values[sw.id] ?? 0
                return (
                  <button key={sw.id} type="button" className={'r10-btn' + (v ? ' on' : '')} aria-pressed={v > 0} onClick={() => void pressSwitch(m, sw)}>
                    {switchLabel(sw, v)}
                  </button>
                )
              })}
            </div>
          )}
          <div className="gx-mthings">
            {m.objects.map((o) => (
              <button key={o.id} type="button" className={'gx-thing' + (o.shown ? ' on' : '')} aria-pressed={!!o.shown} title={o.shown ? 'Players see it. Hide it.' : 'Hidden. Show it to players.'} onClick={() => void gmRun('gm.object.show', { map: m.id, object: o.id, shown: !o.shown })}>
                <Diamond />
                {o.name}
                <Eye off={!o.shown} size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Where to start the night: one picture for each. Loading one only moves things: everyone's position, the NPCs and each
 * map's mood. HP, Entropy, pockets and the Codex stay as they are.
 */
function ActsSection({ view }: { view: View }) {
  const [picked, setPicked] = useState<string | null>(null)
  const presets = view.presets ?? []
  const load = async (id: string) => {
    const ack = await gmRun('gm.world.load_preset', { preset: id, scene: true })
    setPicked(null)
    if (!ack.ok) return
    useGame.setState({ gmMap: null }) // the Scene goes to wherever the party now is
    location.hash = 'scene'
  }
  return (
    <section className="gx-session" aria-label="Acts">
      {[...new Set(presets.map((p) => p.act))].map((act) => (
        <div key={act} role="group" aria-label={act}>
          <div className="gx-sh">
            <span className="r5-sec">{act}</span>
          </div>
          <div className="gx-cards">
            {presets.filter((p) => p.act === act).map((p) => (
              <div key={p.id} className={'gx-card' + (picked === p.id ? ' on' : '')}>
                <button type="button" className="gx-cardpick" aria-pressed={picked === p.id} onClick={() => setPicked(picked === p.id ? null : p.id)}>
                  {p.card && <img src={p.card} alt="" />}
                  <span className="gx-cardt">
                    <span className="gx-cardn">{p.name}</span>
                    <span className="gx-cardb">{p.blurb}</span>
                  </span>
                </button>
                {picked === p.id && (
                  <div className="gx-cardgo" role="alertdialog" aria-label={`Load ${p.name}?`}>
                    <button type="button" className="r12-go" title="Moves everyone, places the NPCs, sets every map's mood, and ends any fight. HP, Entropy, pockets and the Codex stay as they are." onClick={() => void load(p.id)}>
                      Load it
                    </button>
                    <button type="button" className="r10-btn" onClick={() => setPicked(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
