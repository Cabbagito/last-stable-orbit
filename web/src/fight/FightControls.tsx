import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gmRun, useGame } from '../store/game'
import type { MapView, TokenView } from '../types'
import { fightOn } from './fights'

/** "The Promenade" mid-sentence: "on the Promenade". */
const inText = (name: string) => name.replace(/^The /, 'the ')

/**
 * Beside the map's moods (Round 16): "Start a fight" opens the dialog. During a fight it reads "Fight · round n",
 * which reopens the dialog to add or take out fighters, and "End fight", which asks once more.
 */
export function FightBar({ map }: { map: MapView }) {
  const view = useGame((s) => s.view)
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const fight = fightOn(view, map.id)
  useEffect(() => setArmed(false), [map.id, !!fight])
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <>
      <div className="r10-mood" role="group" aria-label="Fight">
        {fight ? (
          <>
            <button type="button" className="on" title="Who's in the fight: add or take out fighters" onClick={() => setOpen(true)}>
              Fight · round {fight.round ?? 1}
            </button>
            <button
              type="button"
              className={armed ? 'app-armed' : ''}
              onClick={() => {
                if (!armed) return setArmed(true)
                setArmed(false)
                void gmRun('gm.fight.end', { map: map.id })
              }}
            >
              {armed ? 'End it?' : 'End fight'}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)}>
            Start a fight
          </button>
        )}
      </div>
      {/* at the app's root: the map's name block it's opened from takes no clicks and sits under the map */}
      {open && createPortal(<FightDialog map={map} onClose={() => setOpen(false)} />, document.querySelector('.r4') ?? document.body)}
    </>
  )
}

/**
 * "Who's in the fight": everyone on this map, the crew there first (ticked), then every NPC token (unticked);
 * a hidden one is marked, and shown to everyone when it joins. No dice: they're rolled regardless. During a fight,
 * a tick adds or takes out that fighter at once.
 */
function FightDialog({ map, onClose }: { map: MapView; onClose: () => void }) {
  const view = useGame((s) => s.view)
  const fight = fightOn(view, map.id)
  const first = useRef<HTMLInputElement>(null)
  const onMap = Object.values(view?.tokens ?? {}).filter((t) => t.map === map.id)
  const crewOrder = view?.crew.map((c) => c.id) ?? []
  const crew = onMap.filter((t) => t.kind === 'crew').sort((a, b) => crewOrder.indexOf(a.ref) - crewOrder.indexOf(b.ref))
  const npcs = onMap.filter((t) => t.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(crew.map((t) => [t.id, true])))
  const [busy, setBusy] = useState(false)
  const inFight = (id: string) => !!fight?.fighters.some((x) => x.token === id)
  const away = (view?.crew ?? []).filter((c) => !crew.some((t) => t.ref === c.id))
  const where = (char: string) => {
    const t = Object.values(view?.tokens ?? {}).find((x) => x.kind === 'crew' && x.ref === char)
    return t && view?.maps[t.map] ? view.maps[t.map].name : null
  }
  useEffect(() => {
    first.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const toggle = (t: TokenView) => {
    if (!fight) return setPicked((p) => ({ ...p, [t.id]: !p[t.id] }))
    void gmRun(inFight(t.id) ? 'gm.fight.remove' : 'gm.fight.add', { map: map.id, token: t.id })
  }
  const start = async () => {
    const tokens = [...crew, ...npcs].filter((t) => picked[t.id]).map((t) => t.id)
    setBusy(true)
    const ack = await gmRun('gm.fight.start', { map: map.id, tokens })
    setBusy(false)
    if (ack.ok) onClose()
  }
  const row = (t: TokenView, i: number) => {
    const on = fight ? inFight(t.id) : !!picked[t.id]
    return (
      <label key={t.id} className={'app-fdrow' + (on ? '' : ' off')}>
        <input ref={i === 0 ? first : undefined} type="checkbox" checked={on} onChange={() => toggle(t)} />
        <img src={t.portrait} alt="" className="r3-px" style={{ boxShadow: `0 0 0 1.5px ${t.color}` }} />
        <span className="app-fdname">
          {t.name}
          {t.kind === 'npc' && t.role && <span className="r10-dimtxt"> · {t.role}</span>}
        </span>
        {t.hidden && <span className="app-fdtag">{fight ? 'Hidden · shown if it joins' : 'Hidden · shown when it starts'}</span>}
      </label>
    )
  }
  const count = [...crew, ...npcs].filter((t) => picked[t.id]).length
  return (
    <div className="app-fscrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="app-fdlg" role="dialog" aria-modal="true" aria-label="Who's in the fight">
        <div className="r4-name">Who's in the fight</div>
        <div className="r5-role">
          {fight
            ? `Round ${fight.round ?? 1} on ${inText(map.name)}. A tick adds someone (they roll their Reflex and slot in) or takes them out.`
            : `Everyone on ${inText(map.name)}. Their Reflex is rolled when you start, and the order goes up on everyone's screen.`}
        </div>
        {crew.length > 0 && <div className="r5-sec app-fdsec">The crew here</div>}
        {crew.map(row)}
        {away.map((c) => (
          <div key={c.id} className="app-fdnote">
            {c.short} is {where(c.id) ? `on ${inText(where(c.id)!)}` : 'somewhere else'}.
          </div>
        ))}
        {npcs.length > 0 && <div className="r5-sec app-fdsec">Everyone else here</div>}
        {npcs.map((t, i) => row(t, crew.length + i))}
        <div className="app-fdbtns">
          {fight ? (
            <button type="button" className="r4-btn" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="r10-roll" disabled={busy || count < 2} onClick={() => void start()}>
                Roll for initiative
              </button>
              <button type="button" className="r4-btn" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
