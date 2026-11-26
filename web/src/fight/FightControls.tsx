import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gmRun, useGame } from '../store/game'
import { FistIcon } from '../gm/parts'
import { serverClock } from '../net/clock'
import type { FightView, MapView, TokenView } from '../types'
import { fightOn } from './fights'
import { useLanding } from './Strip'
import { useKeyHandler } from '../keys/registry'

/** "The Promenade" mid-sentence: "on the Promenade". */
const inText = (name: string) => name.replace(/^The /, 'the ')

/** In the column's "Here" heading: opens "Who's in the fight". */
export function StartFight({ map }: { map: MapView }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={'gx-ibtn fight' + (open ? ' on' : '')} title="Start a fight" aria-label="Start a fight" onClick={() => setOpen(true)}>
        <FistIcon />
      </button>
      {open && <FightDialog map={map} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * At the top of the GM's column during a fight: Next turn, which appears once the dice have landed, the round,
 * "Who's in" to add or take out fighters, and "End", which asks once more.
 */
export function FightBlock({ fight, map }: { fight: FightView; map: MapView }) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const { place } = useLanding(fight)
  const t = serverClock.now() / 1000
  const settling = fight.fighters.some((x) => t < place[x.token])
  useKeyHandler('fight.next', () => {
    if (settling) return false
    void gmRun('gm.fight.next', { map: fight.map })
  })
  useEffect(() => setArmed(false), [map.id])
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <section className="gx-fight" aria-label="The fight">
      <button type="button" className="r10-roll" disabled={settling} title="Next turn (N)" onClick={() => void gmRun('gm.fight.next', { map: fight.map })}>
        {settling ? 'Rolling…' : 'Next turn'}
      </button>
      <div className="gx-fmeta">
        <span className="r5-sec">Round {fight.round ?? 1}</span>
        <span>
          <button type="button" className="gx-lnk" onClick={() => setOpen(true)}>
            Who's in
          </button>{' '}
          &nbsp;{' '}
          <button
            type="button"
            className={'gx-lnk' + (armed ? ' armed' : '')}
            onClick={() => {
              if (!armed) return setArmed(true)
              setArmed(false)
              void gmRun('gm.fight.end', { map: map.id })
            }}
          >
            {armed ? 'End it?' : 'End'}
          </button>
        </span>
      </div>
      {open && <FightDialog map={map} onClose={() => setOpen(false)} />}
    </section>
  )
}

// The fight track picked last time is the one offered next time; picking none is remembered too.
const MUSIC_KEY = 'lso.fightMusic'
const NO_MUSIC = '-'
const recall = () => {
  try {
    return window.localStorage.getItem(MUSIC_KEY)
  } catch {
    return null // storage is off: the first track is offered
  }
}
const remember = (v: string) => {
  try {
    window.localStorage.setItem(MUSIC_KEY, v)
  } catch {
    // storage is off: it's only a convenience
  }
}

/**
 * "Who's in the fight": everyone on this map, the crew there first (ticked), then every NPC token (unticked);
 * a hidden one is marked, and shown to everyone when it joins. No dice: they're rolled regardless. During a fight,
 * a tick adds or takes out that fighter at once. Before one, the Music row picks the track it brings (or none).
 */
function FightDialog({ map, onClose }: { map: MapView; onClose: () => void }) {
  return createPortal(<FightDialogBody map={map} onClose={onClose} />, document.querySelector('.r4') ?? document.body)
}

function FightDialogBody({ map, onClose }: { map: MapView; onClose: () => void }) {
  const view = useGame((s) => s.view)
  const fight = fightOn(view, map.id)
  const first = useRef<HTMLInputElement>(null)
  const onMap = Object.values(view?.tokens ?? {}).filter((t) => t.map === map.id)
  const crewOrder = view?.crew.map((c) => c.id) ?? []
  const crew = onMap.filter((t) => t.kind === 'crew').sort((a, b) => crewOrder.indexOf(a.ref) - crewOrder.indexOf(b.ref))
  const npcs = onMap.filter((t) => t.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(crew.map((t) => [t.id, true])))
  const [busy, setBusy] = useState(false)
  // the track the fight brings: it comes in after the bell, and what was playing returns when the fight ends
  const tracks = (view?.stage.deck?.music ?? []).filter((g) => g.fight).flatMap((g) => g.tracks)
  const [music, setMusic] = useState<string>(() => {
    const last = recall()
    return last === NO_MUSIC ? '' : (tracks.find((t) => t.id === last)?.id ?? tracks[0]?.id ?? '')
  })
  const pickMusic = (id: string) => {
    const next = id === music ? '' : id
    setMusic(next)
    remember(next || NO_MUSIC)
  }
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
    const ack = await gmRun('gm.fight.start', music ? { map: map.id, tokens, music } : { map: map.id, tokens })
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
        {!fight && tracks.length > 0 && (
          <>
            <div className="r5-sec app-fdsec">Music</div>
            <div className="app-fdmusic" role="group" aria-label="The fight's music">
              {tracks.map((t) => (
                <button key={t.id} type="button" className={'sd-pad sd-track' + (t.id === music ? ' on' : '')} aria-pressed={t.id === music} onClick={() => pickMusic(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}
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
