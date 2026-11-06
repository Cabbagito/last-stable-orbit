import { useState } from 'react'
import { objectKey } from '../inspect/objects'
import { unproj } from '../lib/proj'
import { gmRoll, gmRun, useGame } from '../store/game'
import type { MapView, RosterNpc, View } from '../types'
import { Cross, Diamond, Eye } from './parts'
import { SendCrew, crewOn, mapList } from './SendCrew'

const DICE = [4, 6, 8, 10, 12, 20]
const DIE_MODES = [
  ['public', 'Public', "The God roll, and everyone sees the number"],
  ['hidden', 'Hidden', "The God roll, and nobody sees the number"],
  ['secret', 'Secret', 'Only you know about it'],
] as const

/** " · fight, round 2" in the map list, for every map with a fight on (M8). */
const fightLabel = (view: View, mapId: string) => {
  const f = view.fights?.find((x) => x.map === mapId)
  return f ? ` · fight, round ${f.round ?? 1}` : ''
}

interface Here {
  key: string
  name: string
  sub: string
  hidden: boolean
  thumb: { src: string; color: string } | null // null: a thing, drawn as its diamond
  open: () => void
  toggle: () => void
  remove?: () => void
}

/**
 * Round 12's left column on the GM's Scene: one list of everything in the scene (things to inspect, NPCs, the
 * crew), each with show/hide and its card a click away; the roster as faces, to add an NPC hidden; and
 * "Just a die", the God roll, pinned to the bottom. Everything else about a character is on its card, which its map
 * chip also opens.
 */
export function GmScene({ map }: { map: MapView | undefined }) {
  const view = useGame((s) => s.view)
  const select = useGame((s) => s.select)
  const setGmMap = useGame((s) => s.setGmMap)
  const gmError = useGame((s) => s.gmError)
  const [sides, setSides] = useState(20)
  const [dieMode, setDieMode] = useState<'public' | 'hidden' | 'secret'>('public')
  const [face, setFace] = useState<{ n: RosterNpc; x: number; y: number } | null>(null)
  if (!view) return null

  const here: Here[] = []
  if (map) {
    for (const o of map.objects) {
      const key = objectKey(map.id, o.id)
      here.push({
        key,
        name: o.name,
        sub: ' · thing',
        hidden: !o.shown,
        thumb: null,
        open: () => select(key),
        toggle: () => void gmRun('gm.object.show', { map: map.id, object: o.id, shown: !o.shown }),
      })
    }
    const onMap = Object.values(view.tokens).filter((t) => t.map === map.id)
    const npcs = onMap.filter((t) => t.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name))
    const crewOrder = view.crew.map((c) => c.id)
    const crew = onMap.filter((t) => t.kind === 'crew').sort((a, b) => crewOrder.indexOf(a.ref) - crewOrder.indexOf(b.ref))
    for (const t of [...npcs, ...crew]) {
      here.push({
        key: t.id,
        name: t.name,
        sub: t.kind === 'crew' ? ' · crew' : t.role ? ` · ${t.role}` : '',
        hidden: !!t.hidden,
        thumb: { src: t.portrait, color: t.color },
        open: () => select(t.id),
        toggle: () => void gmRun('gm.token.hide', { token: t.id, hidden: !t.hidden }),
        remove: t.kind === 'npc' ? () => void gmRun('gm.token.remove', { token: t.id }) : undefined,
      })
    }
  }
  const centre = map ? unproj(map.origin, [map.display[0] / 2, map.display[1] / 2], 0) : null
  const maps = mapList(view)

  return (
    <aside aria-label="Game master controls" className="r4-col r10-gm">
      <div style={{ flex: 'none' }}>
        <div className="r4-name">In this scene</div>
        <div className="r5-role">Click a name or a chip to open its card. Players can't see this column.</div>
      </div>
      {maps.length > 1 && map && (
        <select className="app-select" value={map.id} onChange={(e) => setGmMap(e.target.value)} aria-label="Map">
          {maps.map((m) => {
            const n = crewOn(view, m.id)
            return (
              <option key={m.id} value={m.id}>
                {m.name}
                {n ? ` · ${n} crew` : ''}
                {fightLabel(view, m.id)}
              </option>
            )
          })}
        </select>
      )}
      {map && <SendCrew view={view} map={map} />}
      {gmError && (
        <div className="app-error" role="alert">
          {gmError}
        </div>
      )}

      <section aria-label="Everything in this scene">
        <div className="r5-rows">
          {here.map((h) => (
            <div key={h.key} className={'r5-row r10-hrow' + (h.hidden ? ' dim' : '')}>
              {h.thumb ? <img src={h.thumb.src} alt="" className="r3-px r10-lthumb" style={{ boxShadow: `0 0 0 1.5px ${h.thumb.color}` }} /> : <Diamond />}
              <button type="button" className="r10-nm" onClick={h.open}>
                {h.name}
                <span className="r10-dimtxt">{h.sub}</span>
              </button>
              <button
                type="button"
                className={'r10-ico' + (h.hidden ? ' off' : '')}
                aria-label={(h.hidden ? 'Show ' : 'Hide ') + h.name}
                title={(h.hidden ? 'Show ' : 'Hide ') + h.name}
                onClick={h.toggle}
              >
                <Eye off={h.hidden} />
              </button>
              {h.remove ? (
                <button type="button" className="r10-ico" aria-label={`Remove ${h.name}`} title="Take off the map" onClick={h.remove}>
                  <Cross />
                </button>
              ) : (
                <span className="r10-icospace" />
              )}
            </div>
          ))}
        </div>
      </section>

      {map && view.roster && (
        <section aria-label="Add an NPC">
          <div className="r5-sec">
            Add an NPC <span style={{ letterSpacing: '.08em' }}>· placed hidden</span>
          </div>
          <div className="r10-roster">
            {view.roster.map((n) => {
              const show = (el: HTMLElement) => {
                const r = el.getBoundingClientRect()
                setFace({ n, x: r.left, y: r.top - 4 })
              }
              const hide = () => setFace((f) => (f?.n.id === n.id ? null : f))
              return (
                <button
                  key={n.id}
                  type="button"
                  className="r10-face"
                  aria-label={`Place ${n.name}` + (n.role ? `, ${n.role}` : '') + ', hidden, in the middle of the map'}
                  onClick={() => void gmRun('gm.token.place', { ref: n.id, map: map.id, at: centre, hidden: true })}
                  onMouseEnter={(e) => show(e.currentTarget)}
                  onMouseLeave={hide}
                  onFocus={(e) => show(e.currentTarget)}
                  onBlur={hide}
                >
                  <img src={n.portrait} alt="" className="r3-px" style={{ boxShadow: `0 0 0 1.5px ${n.color}` }} />
                </button>
              )
            })}
          </div>
          {face && (
            <div className="app-hovertag" style={{ left: face.x, top: face.y }} aria-hidden="true">
              {face.n.name}
              {face.n.role && <span className="r10-dimtxt"> · {face.n.role}</span>}
            </div>
          )}
        </section>
      )}

      <section aria-label="Just a die" className="r17-jdie">
        <div className="r5-sec">
          Just a die <span style={{ letterSpacing: '.08em' }}>· the God roll</span>
        </div>
        <div className="r10-seg" role="group" aria-label="Die">
          {DICE.map((d) => (
            <button key={d} type="button" className={sides === d ? 'on' : ''} aria-pressed={sides === d} onClick={() => setSides(d)}>
              d{d}
            </button>
          ))}
        </div>
        <div className="r10-go">
          <button type="button" className="r10-roll" onClick={() => void gmRoll({ token: null, sides, mode: dieMode })}>
            Roll d{sides}
          </button>
          <div className="r17-rseg r17-jmodes" role="group" aria-label="What players see">
            {DIE_MODES.map(([id, name, title]) => (
              <button key={id} type="button" className={'r17-rb' + (dieMode === id ? ' on' : '')} aria-pressed={dieMode === id} title={title} onClick={() => setDieMode(id)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </section>
    </aside>
  )
}
