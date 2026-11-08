import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { STAT_LOOK } from '../roll/stats'
import { gmRoll, gmRun, send, useGame, type GmRollMode } from '../store/game'
import { STATS, type BenchDice, type BenchMoment, type BenchView, type StatKey, type View } from '../types'
import { ENTROPY_MAX } from './parts'

// The sandbox's tools (`make sandbox`). The server sends `bench` only there, so on the real table none of this shows.

const NEXT_DIE: [BenchDice, string][] = [
  ['random', 'Random'],
  ['one', 'Natural 1'],
  ['boom', 'Explodes once'],
  ['boom2', 'Explodes twice'],
]

const LAND_AT = 2800 // ms the dice fly, as a roll screen's do
const NEXT_AT = 1600 // each die an explosion adds
const HOLD = 4000 // after the last die, before it closes

/** A crew member's roll, as if they'd pressed it, landing on a timer. Resolves with the roll's id once it has landed. */
async function crewRoll(seat: string, stat: StatKey, entry?: number): Promise<string | null> {
  const ack = await gmRun('bench.as', { seat, type: 'roll.start', args: entry === undefined ? { stat } : { stat, entry } })
  if (!ack.ok) return null
  const r = useGame.getState().view?.rolls.filter((x) => x.by === seat && x.open).pop()
  if (!r?.dice) return null
  const reveal = (shown: number) => void send('bench.as', { seat, type: 'roll.reveal', args: { roll: r.id, shown } })
  const last = LAND_AT + (r.dice.length - 1) * NEXT_AT
  r.dice.forEach((_, i) => window.setTimeout(() => reveal(i + 1), LAND_AT + i * NEXT_AT))
  window.setTimeout(() => void send('bench.as', { seat, type: 'roll.close', args: { roll: r.id } }), last + HOLD)
  return new Promise((done) => window.setTimeout(() => done(r.id), last + 100))
}

const fmt = (at: number) => new Date(at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function Bench({ view, bench }: { view: View; bench: BenchView }) {
  const [as, setAs] = useState(view.crew[0]?.id ?? '')
  const [stat, setStat] = useState<StatKey>('cool')
  const [name, setName] = useState('')
  const c = view.crew.find((x) => x.id === as) ?? view.crew[0]
  if (!c) return null

  const npcFor = (mode: GmRollMode) => {
    const here = Object.values(view.tokens).filter((t) => t.kind === 'npc' && t.map === view.party_map)
    return here.find((t) => (mode === 'someone' ? t.hidden : mode === 'secret' || mode === 'god' ? true : !t.hidden))
  }
  const npcRoll = (mode: GmRollMode) => {
    const t = npcFor(mode)
    if (!t) return useGame.setState({ gmError: `Nobody on the party's map can roll ${mode}: add ${mode === 'someone' ? 'a hidden' : 'a visible'} NPC first.` })
    void gmRoll({ token: t.id, stat, mode })
  }
  const forced = async (die: BenchDice) => {
    await gmRun('bench.dice', { next: die })
    await crewRoll(c.id, stat)
  }
  const failedSkill = async () => {
    const id = await crewRoll(c.id, stat, 0)
    if (id) void gmRun('gm.roll.failed', { roll: id })
  }
  const burn = async (cut?: string) => {
    if (c.entropy < 2) await gmRun('gm.vitals.set', { char: c.id, entropy: 2 })
    void gmRun('gm.burn.use', { char: c.id, cut })
  }
  const vit = (field: 'hp' | 'entropy', v: number) => void gmRun('gm.vitals.set', { char: c.id, [field]: v })
  const credits = (view.inventory[c.id] ?? []).find((e) => e.item.counted)
  const note = view.items?.find((i) => i.kind === 'note')
  const film = view.stage.cues?.find((q) => q.ready)

  const moment = (m: BenchMoment, label: string, sub?: string) => (
    <div key={m.id} className="gx-brow">
      <div className="gx-mname">
        <b>{m.name}</b>
        {sub && <small>{sub}</small>}
      </div>
      <button type="button" className="r10-btn" onClick={() => void gmRun('bench.back', { id: m.id })}>
        {label}
      </button>
    </div>
  )

  return (
    <div className="gx-bench">
      <div className="gx-bcol">
        <div className="gx-bsec">
          <div className="r5-sec">Start from</div>
          <div>
            {bench.scenarios.map((s) => (
              <div key={s.id} className="gx-brow">
                <div className="gx-mname">
                  <b>{s.name}</b>
                  <small>{s.note}</small>
                </div>
                <button type="button" className="r10-btn" onClick={() => void gmRun('bench.scenario', { id: s.id })}>
                  Load
                </button>
              </div>
            ))}
            {bench.start.map((m) => moment(m, 'Load', 'Where this sandbox started'))}
          </div>
        </div>
        <div className="gx-bsec">
          <div className="r5-sec">Moments</div>
          <form
            className="r10-go"
            onSubmit={(e) => {
              e.preventDefault()
              void gmRun('bench.keep', { name })
              setName('')
            }}
          >
            <input className="app-select" style={{ flex: 1, minWidth: 0 }} placeholder="What's this moment?" aria-label="Name this moment" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="r10-btn">
              Keep this moment
            </button>
          </form>
          <div>{bench.kept.map((m) => moment(m, 'Back to it', fmt(m.at)))}</div>
        </div>
        <div className="gx-bsec">
          <div className="r5-sec">Last changes</div>
          <div>
            {bench.history.map((m, i) => (
              <div key={m.id} className="gx-brow slim">
                <div className="gx-mname">
                  <b>{m.name}</b>
                </div>
                {i > 0 && (
                  <button type="button" className="r10-btn" onClick={() => void gmRun('bench.back', { id: m.id })}>
                    Back to here
                  </button>
                )}
              </div>
            ))}
            {bench.history.length === 0 && <div className="r10-dimtxt">Nothing yet.</div>}
          </div>
        </div>
      </div>

      <div className="gx-bcol">
        <div className="gx-bsec">
          <div className="r5-sec">The next die</div>
          <div className="gx-pad" role="group" aria-label="The next die">
            {NEXT_DIE.map(([id, label]) => (
              <button key={id} type="button" className={'r10-btn' + (bench.dice === id ? ' armed' : '')} aria-pressed={bench.dice === id} onClick={() => void gmRun('bench.dice', { next: id })}>
                {label}
              </button>
            ))}
          </div>
          <div className="r10-hint">Used by the next roll, on any seat, then back to random.</div>
        </div>
        <div className="gx-bsec">
          <div className="r5-sec">Seats</div>
          <a className="r10-cta gx-cta" href="#gm/seats" target="_blank" rel="noreferrer">
            Open every seat
          </a>
          <div className="r10-hint">In a new window: all five players and the TV, live.</div>
          <div className="gx-brow">
            <div className="gx-mname">
              <b>Pretend the TV is on</b>
              <small>So Play works with no TV open</small>
            </div>
            <div className="r12-seg3 gx-seg2" role="group" aria-label="Pretend the TV is on">
              <button type="button" className={bench.tv ? 'on' : ''} aria-pressed={bench.tv} onClick={() => void gmRun('bench.tv', { on: true })}>
                On
              </button>
              <button type="button" className={bench.tv ? '' : 'on'} aria-pressed={!bench.tv} onClick={() => void gmRun('bench.tv', { on: false })}>
                Off
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="gx-bcol">
        <div className="gx-bsec">
          <div className="r5-sec">Fire it, as</div>
          <div className="ev-row">
            {view.crew.map((x) => (
              <button key={x.id} type="button" className={'ev-pk' + (x.id === c.id ? ' on' : '')} style={{ '--cc': x.color } as CSSProperties} aria-pressed={x.id === c.id} onClick={() => setAs(x.id)}>
                <img src={x.portrait} alt="" />
                <span>{x.short}</span>
              </button>
            ))}
          </div>
          <div className="gx-grid" role="group" aria-label="With which stat">
            {STATS.map((s) => (
              <button key={s} type="button" className={'r10-btn' + (stat === s ? ' on' : '')} aria-pressed={stat === s} onClick={() => setStat(s)}>
                {STAT_LOOK[s].title}
              </button>
            ))}
          </div>
        </div>
        <Fire title="Their roll" buttons={[['Roll', () => void crewRoll(c.id, stat)], ['Natural 1', () => void forced('one')], ['Explodes', () => void forced('boom')], ['A failed skill, on the TV', () => void failedSkill()]]} />
        <Fire title="An NPC's roll" buttons={(['public', 'hidden', 'someone', 'secret', 'god'] as GmRollMode[]).map((m) => [m[0].toUpperCase() + m.slice(1), () => npcRoll(m)])} />
        <Fire title="Their Burn" buttons={c.burn ? c.burn.cuts.map((b) => [c.burn!.cuts.length > 1 ? b.label : c.burn!.name, () => void burn(b.id)]) : []} />
        <Fire
          title="On their chip"
          buttons={[
            ['Hit', () => vit('hp', c.hp - 1)],
            ['Heal', () => vit('hp', c.hp + 1)],
            ['Entropy up', () => vit('entropy', Math.min(ENTROPY_MAX, c.entropy + 1))],
            ['Entropy down', () => vit('entropy', c.entropy - 1)],
            ['Item in', () => note && void gmRun('gm.item.give', { holder: c.id, item: note.id })],
            ['Credits up', () => credits && void gmRun('gm.item.count', { holder: c.id, uid: credits.uid, count: (credits.count ?? 0) + 50 })],
            ['Down at 0', () => vit('hp', 0)],
          ]}
        />
        <Fire title="A film" buttons={film ? [[film.name, () => void gmRun('gm.film.play', { cue: film.id })]] : []} />
        <Fire title="An event" buttons={(view.overviews?.games ?? []).map((g) => [g.name, () => void gmRun('gm.overview.send', { overview: g.id, chars: [c.id] })])} />
      </div>
    </div>
  )
}

function Fire({ title, buttons }: { title: string; buttons: [string, () => void][] }) {
  if (!buttons.length) return null
  return (
    <div className="gx-bsec">
      <div className="r5-sec">{title}</div>
      <div className="gx-grid">
        {buttons.map(([label, go]) => (
          <button key={label} type="button" className="r10-btn" onClick={go}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Every seat, live, as that seat sees it. Pick Act and its buttons work: roll, Burn or putt from here. */
export function Seats({ view }: { view: View }) {
  const seats = [...view.crew.map((c) => ({ id: c.id, name: c.short })), { id: 'stage', name: 'The TV' }]
  const [acting, setActing] = useState<Record<string, boolean>>({ stage: true })
  return (
    <div className="gx-wall">
      {seats.map((s) => (
        <div key={s.id} className={'gx-seat' + (acting[s.id] ? ' act' : '')}>
          <div className="gx-seatbar">
            <span className="r4-lab">{s.name.toUpperCase()}</span>
            {s.id !== 'stage' && (
              <div className="r17-rseg" role="group" aria-label={`${s.name}: watch or act`}>
                <button type="button" className={'r17-rb' + (acting[s.id] ? '' : ' on')} aria-pressed={!acting[s.id]} onClick={() => setActing({ ...acting, [s.id]: false })}>
                  Watch
                </button>
                <button type="button" className={'r17-rb' + (acting[s.id] ? ' on' : '')} aria-pressed={!!acting[s.id]} onClick={() => setActing({ ...acting, [s.id]: true })}>
                  Act
                </button>
              </div>
            )}
          </div>
          <SeatFrame key={String(!!acting[s.id])} seat={s.id} name={s.name} act={!!acting[s.id]} />
        </div>
      ))}
    </div>
  )
}

/** The seat's real app in a frame, 1440 x 900 and scaled to fit. The TV counts as the table's TV while it's open. */
function SeatFrame({ seat, name, act }: { seat: string; name: string; act: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(0.3)
  useLayoutEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / 1440))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="gx-frame">
      <iframe title={`${name}'s screen`} src={`/?as=${seat}${act ? '&act=1' : ''}#scene`} style={{ transform: `scale(${k})` }} />
    </div>
  )
}
