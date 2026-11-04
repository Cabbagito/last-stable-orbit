import { useState } from 'react'
import { unproj } from '../lib/proj'
import { ring } from '../lib/ring'
import { RingPortrait } from '../shell/RingPortrait'
import { send, useGame } from '../store/game'
import type { MapView } from '../types'

/**
 * The GM's left column on the Scene, in place of a character sheet: crew vitals, the map's mood and
 * switches, the tokens on this map, the NPC roster and presets. Milestone 4 gives the GM tab its own design.
 */
export function GmPanel({ map }: { map: MapView | undefined }) {
  const view = useGame((s) => s.view)
  const setGmMap = useGame((s) => s.setGmMap)
  const select = useGame((s) => s.select)
  const [preset, setPreset] = useState('')
  const [err, setErr] = useState('')
  if (!view) return null

  const run = async (type: string, args: Record<string, unknown>) => {
    const ack = await send(type, args)
    setErr(ack.ok ? '' : ack.error || ack.code || 'That did not work')
  }

  const onMap = map
    ? Object.values(view.tokens)
        .filter((t) => t.map === map.id)
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'crew' ? -1 : 1))
    : []
  const placed = new Set(onMap.filter((t) => t.kind === 'npc').map((t) => t.ref))
  const switches = map ? map.switches.filter((s) => !s.moods.length || s.moods.includes(map.mood)) : []
  const centre = map ? unproj(map.origin, [map.display[0] / 2, map.display[1] / 2], 0) : null

  return (
    <aside aria-label="Game master controls" className="r4-col app-gm">
      <div>
        <div className="r4-name">Game master</div>
        <div className="r5-role">Players can't see this column.</div>
      </div>
      {err && (
        <div className="app-error" role="alert">
          {err}
        </div>
      )}

      <section aria-label="Crew vitals">
        <div className="r5-sec">Crew</div>
        <div className="r5-rows">
          {view.crew.map((c) => (
            <div key={c.id} className="r5-row app-gmrow">
              <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 40, 6)} size={40} />
              <span className="app-gmname">{c.short}</span>
              <Stepper label="HP" value={c.hp} onChange={(hp) => run('gm.vitals.set', { char: c.id, hp })} />
              <Stepper label="EN" value={c.entropy} onChange={(entropy) => run('gm.vitals.set', { char: c.id, entropy })} />
            </div>
          ))}
        </div>
      </section>

      {map && (
        <section aria-label="Map state">
          <div className="r5-sec">Map</div>
          {Object.keys(view.maps).length > 1 && (
            <select className="app-select" value={map.id} onChange={(e) => setGmMap(e.target.value)}>
              {Object.values(view.maps).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <div className="app-btnrow">
            {map.moods.map((m) => (
              <button
                key={m.id}
                type="button"
                className={'r4-btn app-toggle' + (map.mood === m.id ? ' on' : '')}
                aria-pressed={map.mood === m.id}
                onClick={() => run('gm.map.mood', { map: map.id, mood: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
          {switches.map((s) => {
            const v = map.values[s.id] ?? 0
            return s.type === 'bool' ? (
              <div key={s.id} className="app-btnrow">
                <button
                  type="button"
                  className={'r4-btn app-toggle' + (v ? ' on' : '')}
                  aria-pressed={!!v}
                  onClick={() => run('gm.map.switch', { map: map.id, switch: s.id, value: v ? 0 : 1 })}
                >
                  {s.label}: {v ? 'on' : 'off'}
                </button>
              </div>
            ) : (
              <div key={s.id} className="app-btnrow" role="group" aria-label={s.label}>
                <span className="r4-lab app-inline">{s.label.toUpperCase()}</span>
                {Array.from({ length: s.max + 1 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={'r4-btn app-toggle app-sq' + (v === i ? ' on' : '')}
                    aria-pressed={v === i}
                    onClick={() => run('gm.map.switch', { map: map.id, switch: s.id, value: i })}
                  >
                    {i}
                  </button>
                ))}
              </div>
            )
          })}
        </section>
      )}

      {map && (
        <section aria-label="Tokens on this map">
          <div className="r5-sec">On the map</div>
          <div className="r5-rows">
            {onMap.map((t) => (
              <div key={t.id} className={'r5-row app-gmrow' + (t.hidden ? ' app-dim' : '')}>
                <button type="button" className="app-link app-grow" onClick={() => select(t.id)}>
                  {t.name}
                  {t.hidden ? ' · hidden' : ''}
                </button>
                <button type="button" className="r4-btn app-small" onClick={() => run('gm.token.hide', { token: t.id, hidden: !t.hidden })}>
                  {t.hidden ? 'Show' : 'Hide'}
                </button>
                {t.kind === 'npc' && (
                  <button type="button" className="r4-btn app-small" onClick={() => run('gm.token.remove', { token: t.id })}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {map && view.roster && (
        <section aria-label="NPC roster">
          <div className="r5-sec">Roster</div>
          <div className="r5-rows">
            {view.roster.map((n) => (
              <div key={n.id} className="r5-row app-gmrow">
                <img src={n.portrait} alt="" className="r3-px" style={{ width: 32, height: 32, borderRadius: '50%', boxShadow: `0 0 0 1.5px ${n.color}` }} />
                <span className="app-grow">{n.name}</span>
                <button
                  type="button"
                  className="r4-btn app-small"
                  onClick={() => run('gm.token.place', { ref: n.id, map: map.id, at: centre, hidden: true })}
                  aria-label={`Place ${n.name}`}
                  title="Places it hidden in the middle of the map. Drag it, then Show it."
                >
                  {placed.has(n.id) ? 'Place another' : 'Place'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {view.presets && (
        <section aria-label="Presets">
          <div className="r5-sec">Presets</div>
          <div className="app-btnrow">
            <select className="app-select app-grow" value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="">Choose a scene…</option>
              {view.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="r4-btn app-small"
              disabled={!preset}
              onClick={() => {
                if (window.confirm('Load this preset? It replaces every position, mood, vital and inventory.')) run('gm.world.load_preset', { preset })
              }}
            >
              Load
            </button>
          </div>
        </section>
      )}
    </aside>
  )
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className="app-stepper" role="group" aria-label={label}>
      <span className="r4-lab">{label}</span>
      <button type="button" className="r4-btn app-sq" aria-label={`${label} down`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="app-num">{value}</span>
      <button type="button" className="r4-btn app-sq" aria-label={`${label} up`} disabled={value >= 6} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  )
}
