import { useEffect, useState } from 'react'
import { GiveRow, Pocket, Step, Diamond, Eye, ENTROPY_MAX, itemAria } from '../gm/parts'
import { CamerasButton, liveSwitches, pressSwitch, switchLabel } from '../gm/MoodBar'
import { MiniMap } from '../gm/MiniMap'
import { SendCrew, mapList } from '../gm/SendCrew'
import { ViewAs } from '../gm/ViewAs'
import { CodexSection } from '../gm/CodexSection'
import { CutscenesSection, TvSection } from '../gm/StageSections'
import { ring } from '../lib/ring'
import { RingPortrait } from '../shell/RingPortrait'
import { useItemTip, type TipBind } from '../inspect/ItemTip'
import { gmRun, useGame } from '../store/game'
import type { CrewMember, InvEntry, View } from '../types'

type Section = 'crew' | 'cut' | 'tv' | 'maps' | 'codex' | 'session'

const SECTIONS: [Section, string, string?][] = [
  ['crew', 'Crew and pockets'],
  ['cut', 'Cutscenes'],
  ['tv', 'The TV'],
  ['maps', 'Maps'],
  ['codex', 'Codex'],
  ['session', 'Session'],
]

/**
 * The GM tab (Round 12, board R12TabCrew): what you do between scenes. A section nav on the left; the crew's
 * HP, Entropy and every pocket; every map's mood, switches and things; New session and presets; and a
 * read-only look at any player's screen; the cue list; and the TV: where you're playing, and its camera.
 */
export function GmTab() {
  const view = useGame((s) => s.view)
  const gmError = useGame((s) => s.gmError)
  const [section, setSection] = useState<Section>('crew')
  const [viewAs, setViewAs] = useState<string | null>(null)
  if (!view) return <div className="app-body app-wait">Docking…</div>
  const seeing = viewAs ? view.crew.find((c) => c.id === viewAs) : undefined

  return (
    <div className="r12-tab">
      <nav className="r10-nav" aria-label="GM tab">
        <div className="r5-sec">GM tab</div>
        <div className="r5-rows">
          {SECTIONS.map(([id, name, later]) => (
            <button key={id} type="button" className={'r10-seat r10-wnav' + (section === id ? ' on' : '')} aria-pressed={section === id} onClick={() => setSection(id)}>
              <span>{name}</span>
              {later && <span className="r10-dimtxt">{later}</span>}
            </button>
          ))}
        </div>
        {gmError && (
          <div className="app-error" role="alert" style={{ marginTop: 10 }}>
            {gmError}
          </div>
        )}
      </nav>
      <div className="r12-main">
        {section === 'crew' && <CrewSection view={view} onView={setViewAs} />}
        {section === 'maps' && <MapsSection view={view} />}
        {section === 'codex' && <CodexSection view={view} />}
        {section === 'session' && <SessionSection view={view} />}
        {section === 'cut' && <CutscenesSection view={view} />}
        {section === 'tv' && <TvSection view={view} />}
      </div>
      {seeing && <ViewAs who={seeing} onClose={() => setViewAs(null)} />}
    </div>
  )
}

type Carry = { holder: string; uid: string } | null

function CrewSection({ view, onView }: { view: View; onView: (id: string) => void }) {
  const [carry, setCarry] = useState<Carry>(null)
  const [giveTo, setGiveTo] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null) // the row a dragged item is over
  const { bind: tip, tip: itemTip } = useItemTip() // each item as its holder sees it
  const held = (holder: string, uid: string) => (view.inventory[holder] ?? []).find((e) => e.uid === uid)
  const carried = carry ? held(carry.holder, carry.uid) : undefined
  useEffect(() => {
    if (carry && !carried) setCarry(null) // it was taken or moved elsewhere
  }, [carry, carried])
  const nameOf = (id: string) => view.crew.find((c) => c.id === id)?.short ?? id
  const moveTo = (to: string, from: Carry = carry) => {
    if (from && from.holder !== to) void gmRun('gm.item.move', { holder: from.holder, uid: from.uid, to })
    setCarry(null)
  }
  const line =
    carry && carried
      ? `Carrying ${carried.item.name} from ${nameOf(carry.holder)}. Hand it to someone, or click it again to put it back.`
      : 'Click an item to pick it up, then hand it to someone else, or drag it onto them. The × takes it back.'

  return (
    <section aria-label="Crew and pockets" style={{ minWidth: 0 }}>
      <div className="r10-h">Crew</div>
      <div className="r10-hint" style={{ marginTop: 4 }} aria-live="polite">
        {line}
      </div>
      <div className="r10-ctable">
        <div className="r10-chead">
          <span className="r5-sec">Who</span>
          <span className="r5-sec">HP</span>
          <span className="r5-sec">Entropy</span>
          <span className="r5-sec">On hand</span>
          <span />
        </div>
        {view.crew.map((c) => {
          const items = view.inventory[c.id] ?? []
          const target = !!carry && carry.holder !== c.id
          return (
            <div
              key={c.id}
              className={'r10-crow' + (target ? ' target' : '') + (over === c.id ? ' over' : '')}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('application/x-lso-item')) return
                e.preventDefault()
                setOver(c.id)
              }}
              onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                try {
                  moveTo(c.id, JSON.parse(e.dataTransfer.getData('application/x-lso-item')))
                } catch {
                  /* not one of ours */
                }
              }}
            >
              <div className="r10-who2">
                <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 56, 8, c.health)} size={56} />
                <span style={{ minWidth: 0 }}>
                  <span className="r10-cname">{c.name}</span>
                  <br />
                  <span className="r5-role">{c.role}</span>
                </span>
              </div>
              <Step who={c.short} label="HP" tone="hp" value={c.hp} max={c.health} showLabel={false} onChange={(hp) => void gmRun('gm.vitals.set', { char: c.id, hp })} />
              <Step who={c.short} label="EN" tone="en" value={c.entropy} max={ENTROPY_MAX} showLabel={false} onChange={(entropy) => void gmRun('gm.vitals.set', { char: c.id, entropy })} />
              <div className="r10-pkrow" role="group" aria-label={`${c.short}'s pockets`}>
                {items.map((e) => (
                  <CrewPocket key={e.uid} e={e} c={c} carry={carry} setCarry={setCarry} tip={tip} />
                ))}
                {items.length === 0 && <span className="r10-dimtxt">Nothing.</span>}
              </div>
              <div className="r10-acts2">
                {target ? (
                  <button type="button" className="r10-btn on" onClick={() => moveTo(c.id)}>
                    Hand it to {c.short}
                  </button>
                ) : (
                  <>
                    <button type="button" className="r10-btn" aria-expanded={giveTo === c.id} onClick={() => setGiveTo(giveTo === c.id ? null : c.id)}>
                      {giveTo === c.id ? 'Done' : 'Give'}
                    </button>
                    <button type="button" className="r10-btn" aria-label={`See ${c.short}'s screen`} title={`See ${c.short}'s screen`} onClick={() => onView(c.id)}>
                      <Eye off={false} />
                    </button>
                  </>
                )}
              </div>
              {giveTo === c.id && (
                <div className="r10-givebar">
                  <span className="r4-lab">GIVE TO {c.short.toUpperCase()}</span>
                  <GiveRow to={c} items={view.items ?? []} tip={tip} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {itemTip}
    </section>
  )
}

/** A pocket in the crew table: click to pick it up, drag it onto someone, and type a new amount for credits. */
function CrewPocket({ e, c, carry, setCarry, tip }: { e: InvEntry; c: CrewMember; carry: Carry; setCarry: (c: Carry) => void; tip: TipBind }) {
  const on = !!carry && carry.holder === c.id && carry.uid === e.uid
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
              ev.dataTransfer.setData('application/x-lso-item', JSON.stringify({ holder: c.id, uid: e.uid }))
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

/**
 * Every map as it stands right now (Peter, 2026-11-04): a live miniature with its mood, switches, cones and
 * everyone on it (click it to open the map on the Scene), then who's there, its cameras, and its things to
 * inspect. The cards fill the width, two or three across.
 */
function MapsSection({ view }: { view: View }) {
  const setGmMap = useGame((s) => s.setGmMap)
  const crewOrder = view.crew.map((c) => c.id)
  return (
    <section className="app-mapsgrid-wrap" aria-label="Maps">
      <div className="r10-h">Maps</div>
      <div className="app-mapsgrid">
        {mapList(view).map((m) => {
          const sws = liveSwitches(m)
          const here = Object.values(view.tokens).filter((t) => t.map === m.id)
          const crew = here.filter((t) => t.kind === 'crew').sort((a, b) => crewOrder.indexOf(a.ref) - crewOrder.indexOf(b.ref))
          const npcs = here.filter((t) => t.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name))
          const cams = m.cameras
          const camsOn = !!cams && (m.values[cams.switch] ?? 0) > 0
          return (
            <div key={m.id} className="r10-mapcard">
              <MiniMap
                map={m}
                tokens={here}
                onOpen={() => {
                  setGmMap(m.id)
                  location.hash = 'scene'
                }}
              />
              <div>
                <div className="r10-cname">{m.name}</div>
                <div className="r5-role">
                  {m.subtitle}
                  {view.party_map === m.id && <span className="r10-dimtxt"> · the party's map</span>}
                </div>
                <SendCrew view={view} map={m} />
              </div>
              {m.moods.length > 1 && (
                <div className="r10-mood3" role="group" aria-label={`${m.name}: mood`}>
                  {m.moods.map((x) => (
                    <button key={x.id} type="button" className={m.mood === x.id ? 'on' : ''} aria-pressed={m.mood === x.id} onClick={() => void gmRun('gm.map.mood', { map: m.id, mood: x.id })}>
                      {x.label}
                    </button>
                  ))}
                </div>
              )}
              {sws.length > 0 && (
                <div className="r10-swrow">
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
              {cams && (
                <div className="app-camrow">
                  <span className="r4-lab">CAMERAS</span>
                  <span className="r10-dimtxt">
                    {cams.cones.filter((c) => c.mood === null || c.mood === m.mood).length} on the walls · {camsOn ? 'everyone sees their cones' : 'cones hidden'}
                  </span>
                  <CamerasButton map={m} className="r10-btn" />
                </div>
              )}
              <div>
                <span className="r4-lab">HERE</span>
                {here.length ? (
                  <div className="app-who">
                    {[...crew, ...npcs].map((t) => (
                      <span key={t.id} className={'app-whochip' + (t.hidden ? ' off' : '')} title={t.hidden ? `${t.name} (hidden from players)` : t.name}>
                        <img src={t.portrait} alt="" className="r3-px" style={{ boxShadow: `0 0 0 1.5px ${t.color}` }} />
                        {t.name}
                        {t.hidden && <span className="r10-dimtxt"> · hidden</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="r10-dimtxt" style={{ marginTop: 4 }}>
                    Nobody.
                  </div>
                )}
              </div>
              {m.objects.length > 0 && (
                <div>
                  <span className="r4-lab">THINGS TO INSPECT</span>
                  <div className="r5-rows" style={{ marginTop: 4 }}>
                    {m.objects.map((o) => (
                      <div key={o.id} className={'r5-row r10-hrow' + (o.shown ? '' : ' dim')}>
                        <Diamond />
                        <span className="r10-grow">
                          {o.name}
                          <span className="r10-dimtxt">{o.shown ? ' · players see it' : ' · hidden'}</span>
                        </span>
                        <button
                          type="button"
                          className={'r10-ico' + (o.shown ? '' : ' off')}
                          aria-label={(o.shown ? 'Hide ' : 'Show ') + o.name}
                          title={(o.shown ? 'Hide ' : 'Show ') + o.name}
                          onClick={() => void gmRun('gm.object.show', { map: m.id, object: o.id, shown: !o.shown })}
                        >
                          <Eye off={!o.shown} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SessionSection({ view }: { view: View }) {
  const [done, setDone] = useState('')
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(null)
  const [loaded, setLoaded] = useState('')
  const newSession = async () => {
    const ack = await gmRun('gm.session.new', {})
    if (ack.ok) setDone("Done: everyone's Entropy is 2. HP, pockets and maps are as they were.")
  }
  const load = async () => {
    if (!asking) return
    const ack = await gmRun('gm.world.load_preset', { preset: asking.id })
    setAsking(null)
    if (ack.ok) setLoaded(`Loaded "${asking.name}".`)
  }
  return (
    <section className="r10-wide" aria-label="Session">
      <div className="r10-h">Session</div>
      <button type="button" className="r10-cta" onClick={() => void newSession()}>
        New session
      </button>
      <div className={done ? 'r10-done' : 'r10-hint'} aria-live="polite">
        {done || "Sets everyone's Entropy to 2. HP, pockets and maps stay as they are."}
      </div>
      <div className="r5-sec" style={{ marginTop: 14 }}>
        Presets
      </div>
      <div className="r5-rows">
        {(view.presets ?? []).map((p) => (
          <div key={p.id} className="r5-row r10-prow">
            <span className="r10-grow">{p.name}</span>
            <button
              type="button"
              className="r10-btn"
              onClick={() => {
                setAsking(p)
                setLoaded('')
              }}
            >
              Load
            </button>
          </div>
        ))}
      </div>
      {asking && (
        <div className="r10-confirm" role="alertdialog" aria-label={`Load ${asking.name}?`}>
          <div style={{ fontSize: 12.5 }}>Load "{asking.name}"? It replaces every position, mood, vital and pocket.</div>
          <div className="r10-go">
            <button type="button" className="r10-btn" onClick={() => void load()}>
              Load it
            </button>
            <button type="button" className="r10-btn" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {loaded && <div className="r10-done">{loaded}</div>}
    </section>
  )
}
