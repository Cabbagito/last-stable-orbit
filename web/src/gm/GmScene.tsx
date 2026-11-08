import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChipFx } from '../fx/ChipFx'
import { FightBlock, StartFight } from '../fight/FightControls'
import { fightOn } from '../fight/fights'
import { objectKey } from '../inspect/objects'
import { unproj } from '../lib/proj'
import { ring } from '../lib/ring'
import { Orbit, calloutSpeech, isSpinning } from '../roll/Callout'
import { calloutsBy } from '../roll/callouts'
import { RingPortrait } from '../shell/RingPortrait'
import { Flare, burnSpeech, useBurnMark } from '../stage/BurnMark'
import { gmRoll, gmRun, useGame } from '../store/game'
import type { CrewMember, MapView, RosterNpc, TokenView, View } from '../types'
import { Cross, Diamond, ENTROPY_MAX, Eye, MiniStep } from './parts'

const DICE = [4, 6, 8, 10, 12, 20]
const DIE_MODES = [
  ['public', 'Public', 'The God roll, and everyone sees the number'],
  ['hidden', 'Hidden', 'The God roll, and nobody sees the number'],
  ['secret', 'Secret', 'Only you know about it'],
] as const

/**
 * The GM's column on the Scene (the "GM screen, consolidated" canvas). Everything with a number is a row, always
 * visible: the crew pinned at the top, who and what is here in the middle (the only part that scrolls), and a die
 * at the bottom. Which map you're on is picked from its name, over the map (MapPicker.tsx).
 */
export function GmScene({ map }: { map: MapView | undefined }) {
  const view = useGame((s) => s.view)
  const gmError = useGame((s) => s.gmError)
  if (!view) return null
  const fight = map ? fightOn(view, map.id) : undefined
  return (
    <aside aria-label="Game master controls" className="r4-col gx-col">
      {gmError && (
        <div className="app-error" role="alert">
          {gmError}
        </div>
      )}
      {fight && map && <FightBlock fight={fight} map={map} />}
      <CrewRows view={view} now={fight?.now ?? null} />
      {map && (
        <div className="gx-mid">
          <HereRows view={view} map={map} now={fight?.now ?? null} canFight={!fight} />
          <ThingRows map={map} />
        </div>
      )}
      <JustADie />
    </aside>
  )
}

function CrewRows({ view, now }: { view: View; now: string | null }) {
  const calls = useGame((s) => s.calls)
  useGame((s) => s.callTick) // re-render when a roll is over
  const burning = useBurnMark()
  const callouts = calloutsBy(view.rolls, calls, Date.now(), (r) => r.char)
  return (
    <section aria-label="Crew" style={{ flex: 'none' }}>
      <div className="gx-sh">
        <span className="r5-sec">Crew</span>
        <span className="gx-colh">HP</span>
        <span className="gx-colh">Entropy</span>
      </div>
      <div className="gx-rows">
        {view.crew.map((c) => (
          <CrewRow key={c.id} c={c} view={view} now={now} call={callouts[c.id]?.r} burn={burning?.char === c.id ? burning : null} />
        ))}
      </div>
    </section>
  )
}

function CrewRow({ c, view, now, call, burn }: { c: CrewMember; view: View; now: string | null; call: View['rolls'][number] | undefined; burn: ReturnType<typeof useBurnMark> }) {
  const select = useGame((s) => s.select)
  const setGmMap = useGame((s) => s.setGmMap)
  const tok = Object.values(view.tokens).find((t) => t.kind === 'crew' && t.ref === c.id)
  const isNow = !!tok && tok.id === now
  const away = tok && tok.map !== view.party_map ? view.maps[tok.map] : undefined
  const set = (field: 'hp' | 'entropy', v: number) => void gmRun('gm.vitals.set', { char: c.id, [field]: v })
  // the GM calls their newest skill roll a failure once it has landed, and its downside shows on the TV
  const last = view.rolls.filter((r) => r.char === c.id).pop()
  const canFail = last && last.entry && !last.failed && last.phase !== 'roll' && last.phase !== 'boom' ? last : null
  const speech = (call && !burn ? `, ${calloutSpeech(call)}` : '') + (burn ? `, ${burnSpeech(burn)}` : '')
  return (
    <div className={'gx-row crew' + (isNow ? ' now' : '')}>
      <button type="button" className="gx-ring" aria-label={`Open ${c.short}'s card${speech}`} onClick={() => tok && select(tok.id)}>
        <ChipFx id={`c:${c.id}`} down={c.hp <= 0} style={{ position: 'relative', display: 'block', width: 40, height: 40 }}>
          <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 40, 7, c.health)} size={40} />
        </ChipFx>
        {call && !burn && isSpinning(call) && <Orbit stat={call.stat} />}
        {burn && <Flare m={burn} />}
      </button>
      <div className="gx-who">
        {isNow && <span className="gx-nowtag">NOW</span>}
        <button type="button" className="r10-nm" onClick={() => tok && select(tok.id)}>
          {c.short}
        </button>
        {away && (
          <button type="button" className="gx-hop" title={`Go to ${away.name}`} onClick={() => setGmMap(away.id)}>
            {away.name} ›
          </button>
        )}
        {canFail && (
          <button type="button" className="gx-fail" title={`It failed: show the downside of ${canFail.entry} on the TV`} onClick={() => void gmRun('gm.roll.failed', { roll: canFail.id })}>
            Failed?
          </button>
        )}
      </div>
      <MiniStep who={c.short} label="HP" tone="hp" value={c.hp} max={c.health} onChange={(v) => set('hp', v)} />
      <MiniStep who={c.short} label="Entropy" tone="en" value={c.entropy} max={ENTROPY_MAX} onChange={(v) => set('entropy', v)} />
    </div>
  )
}

function HereRows({ view, map, now, canFight }: { view: View; map: MapView; now: string | null; canFight: boolean }) {
  const select = useGame((s) => s.select)
  const [adding, setAdding] = useState(false)
  const add = useRef<HTMLButtonElement>(null)
  const npcs = Object.values(view.tokens)
    .filter((t) => t.map === map.id && t.kind === 'npc')
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return (
    <section aria-label="Who's here">
      <div className="gx-sh">
        <span className="r5-sec">Here</span>
        {view.roster && (
          <button ref={add} type="button" className={'gx-mini' + (adding ? ' on' : '')} aria-expanded={adding} onClick={() => setAdding(!adding)}>
            + Add
          </button>
        )}
        {canFight && <StartFight map={map} />}
      </div>
      <div className="gx-rows">
        {npcs.map((t) => (
          <NpcRow key={t.id} t={t} isNow={t.id === now} open={() => select(t.id)} />
        ))}
        {npcs.length === 0 && <div className="gx-empty">Nobody else here.</div>}
      </div>
      {adding && view.roster && <AddNpc roster={view.roster} map={map} anchor={add.current} onClose={() => setAdding(false)} />}
    </section>
  )
}

function NpcRow({ t, isNow, open }: { t: TokenView; isNow: boolean; open: () => void }) {
  const hp = t.hp ?? 0
  return (
    <div className={'gx-row npc' + (t.hidden ? ' dim' : '') + (isNow ? ' now' : '')}>
      <img src={t.portrait} alt="" className="r3-px gx-face gx-dimme" style={{ boxShadow: `0 0 0 1.5px ${t.color}` }} />
      <div className="gx-who gx-dimme">
        {isNow && <span className="gx-nowtag">NOW</span>}
        <button type="button" className="r10-nm" onClick={open}>
          {t.name}
        </button>
        {t.role && <span className="gx-role">{t.role}</span>}
      </div>
      <MiniStep who={t.name} label="HP" tone="hp" value={hp} max={t.health ?? hp} showMax onChange={(v) => void gmRun('gm.npc.hp', { token: t.id, hp: v })} />
      <EyeButton name={t.name} hidden={!!t.hidden} onToggle={() => void gmRun('gm.token.hide', { token: t.id, hidden: !t.hidden })} />
    </div>
  )
}

function EyeButton({ name, hidden, onToggle }: { name: string; hidden: boolean; onToggle: () => void }) {
  const label = (hidden ? 'Show ' : 'Hide ') + name
  return (
    <button type="button" className={'r10-ico gx-eye' + (hidden ? ' off' : '')} aria-label={label} title={label} onClick={onToggle}>
      <Eye off={hidden} />
    </button>
  )
}

function ThingRows({ map }: { map: MapView }) {
  const select = useGame((s) => s.select)
  const [open, setOpen] = useState(true)
  if (!map.objects.length) return null
  const shown = map.objects.filter((o) => o.shown).length
  return (
    <section aria-label="Things to inspect">
      <div className="gx-sh">
        <span className="r5-sec">
          Things <span style={{ letterSpacing: '.08em' }}>· {shown} of {map.objects.length} shown</span>
        </span>
        <button type="button" className="gx-chev" aria-label={open ? 'Fold the things away' : 'Show the things'} aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d={open ? 'M2.5 8l3.5-3.5L9.5 8' : 'M2.5 4l3.5 3.5L9.5 4'} fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="gx-rows">
          {map.objects.map((o) => (
            <div key={o.id} className={'gx-row thing' + (o.shown ? '' : ' dim')}>
              <span className="gx-dimme">
                <Diamond />
              </span>
              <button type="button" className="r10-nm gx-dimme" onClick={() => select(objectKey(map.id, o.id))}>
                {o.name}
              </button>
              <EyeButton name={o.name} hidden={!o.shown} onToggle={() => void gmRun('gm.object.show', { map: map.id, object: o.id, shown: !o.shown })} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Everyone who can be put on a map, by the groups in npcs.yaml. It stays open, so you can add a few. */
function AddNpc({ roster, map, anchor, onClose }: { roster: RosterNpc[]; map: MapView; anchor: HTMLElement | null; onClose: () => void }) {
  const box = useRef<HTMLElement>(null)
  const centre = unproj(map.origin, [map.display[0] / 2, map.display[1] / 2], 0)
  const groups = [...new Set(roster.map((n) => n.group))]
  const r = anchor?.getBoundingClientRect()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [anchor, onClose])
  const style: CSSProperties = { left: 348, top: Math.max(64, Math.min(r?.top ?? 200, window.innerHeight - 380)), width: 'min(900px, calc(100vw - 364px))' }
  return createPortal(
    <section ref={box} className="gx-pop" role="dialog" aria-label="Add someone" style={style}>
      <div className="gx-poph">
        <span className="r4-name">Add someone</span>
        <span className="r5-role">They land hidden, in the middle of the map. Drag them from there.</span>
        <button type="button" className="gx-x" aria-label="Close" onClick={onClose}>
          <Cross />
        </button>
      </div>
      <div className="gx-dir" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map((g) => (
          <div key={g} className="gx-dcol">
            <div className="r5-sec">{g}</div>
            {roster
              .filter((n) => n.group === g)
              .map((n) => (
                <button key={n.id} type="button" className="gx-np" title={n.role} onClick={() => void gmRun('gm.token.place', { ref: n.id, map: map.id, at: centre, hidden: true })}>
                  <img src={n.portrait} alt="" className="r3-px" style={{ boxShadow: `0 0 0 1.5px ${n.color}` }} />
                  <span>{n.name}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
    </section>,
    document.querySelector('.r4') ?? document.body,
  )
}

/** The God roll: pick who sees it, and press a die to roll it. */
function JustADie() {
  const [mode, setMode] = useState<'public' | 'hidden' | 'secret'>('public')
  return (
    <section className="gx-dock" aria-label="Just a die">
      <div className="gx-sh">
        <span className="r5-sec">Just a die</span>
        <div className="r17-rseg r17-jmodes" role="group" aria-label="What players see">
          {DIE_MODES.map(([id, name, title]) => (
            <button key={id} type="button" className={'r17-rb' + (mode === id ? ' on' : '')} aria-pressed={mode === id} title={title} onClick={() => setMode(id)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="r10-seg" role="group" aria-label="Press a die to roll it">
        {DICE.map((d) => (
          <button key={d} type="button" title={`Roll a d${d}`} aria-label={`Roll a d${d}, ${mode}`} onClick={() => void gmRoll({ token: null, sides: d, mode })}>
            d{d}
          </button>
        ))}
      </div>
    </section>
  )
}
