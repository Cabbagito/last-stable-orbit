import { useState } from 'react'
import { unproj } from '../lib/proj'
import { ring } from '../lib/ring'
import { STAT_LOOK } from '../roll/stats'
import { RingPortrait } from '../shell/RingPortrait'
import { send, useGame } from '../store/game'
import { STATS, type MapView, type RollView, type StatKey, type View } from '../types'

const DICE = [4, 6, 8, 10, 12, 20]

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
  const [rollWho, setRollWho] = useState('')
  const [rollSides, setRollSides] = useState(20)
  const [rollStat, setRollStat] = useState<StatKey>('reflex')
  const [rollHidden, setRollHidden] = useState(false)
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
  const npcsHere = onMap.filter((t) => t.kind === 'npc')
  const who = npcsHere.find((t) => t.id === rollWho)
  const mustHide = !who || !!who.hidden // just a die, or a hidden NPC: only the GM can see it
  const gmRoll = async () => {
    const ack = await send('gm.roll.start', { token: who?.id ?? null, sides: rollSides, stat: rollStat, hidden: mustHide || rollHidden })
    setErr(ack.ok ? '' : ack.error || ack.code || 'That did not work')
    if (!ack.ok) return
    const v = useGame.getState().view
    const mine = v?.rolls.filter((r) => r.by === 'gm' && r.open).pop()
    if (mine) useGame.getState().openRoll(mine.id)
  }

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
        <section aria-label="Roll">
          <div className="r5-sec">Roll</div>
          <select className="app-select" value={who ? who.id : ''} onChange={(e) => setRollWho(e.target.value)} aria-label="Who rolls">
            <option value="">Just a die (only you see it)</option>
            {npcsHere.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.hidden ? ' (hidden)' : ''}
              </option>
            ))}
          </select>
          <div className="app-btnrow" role="group" aria-label="Die">
            {DICE.map((d) => (
              <button key={d} type="button" className={'r4-btn app-toggle app-small' + (rollSides === d ? ' on' : '')} aria-pressed={rollSides === d} onClick={() => setRollSides(d)}>
                d{d}
              </button>
            ))}
          </div>
          <div className="app-btnrow" role="group" aria-label="Look of the roll">
            {STATS.map((st) => (
              <button
                key={st}
                type="button"
                className={'r4-btn app-toggle app-small' + (rollStat === st ? ' on' : '')}
                aria-pressed={rollStat === st}
                onClick={() => setRollStat(st)}
                style={rollStat === st ? { borderColor: STAT_LOOK[st].col } : undefined}
              >
                {STAT_LOOK[st].title}
              </button>
            ))}
          </div>
          <div className="app-btnrow">
            <button
              type="button"
              className={'r4-btn app-toggle app-small' + (mustHide || rollHidden ? ' on' : '')}
              aria-pressed={mustHide || rollHidden}
              disabled={mustHide}
              onClick={() => setRollHidden(!rollHidden)}
              title={mustHide ? 'Only you can see this one' : 'Players see nothing at all'}
            >
              Hidden: {mustHide || rollHidden ? 'yes' : 'no'}
            </button>
            <button type="button" className="r4-btn app-small" style={{ marginLeft: 'auto' }} onClick={gmRoll}>
              Roll d{rollSides}
            </button>
          </div>
          {view.rolls.length > 0 && (
            <div className="r5-rows" aria-label="Recent rolls">
              {view.rolls
                .slice(-6)
                .reverse()
                .map((r) => (
                  <div key={r.id} className={'r5-row app-gmrow' + (r.open ? '' : ' app-dim')}>
                    <span className="app-grow">
                      {rollerName(view, r)} · {STAT_LOOK[r.stat].title} d{r.sides}
                      {r.hidden ? ' · hidden' : ''}
                    </span>
                    <span className="app-num" style={{ width: 'auto', color: r.phase === 'nat1' ? '#ff5b4d' : STAT_LOOK[r.stat].fx }}>
                      {r.value ?? '…'}
                    </span>
                  </div>
                ))}
            </div>
          )}
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

function rollerName(view: View, r: RollView): string {
  if (r.char) return view.crew.find((c) => c.id === r.char)?.short ?? r.char
  if (r.token) return view.tokens[r.token]?.name ?? r.token
  return 'Just a die'
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
