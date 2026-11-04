import { useEffect, useMemo, useRef, useState } from 'react'
import { plainRing, ring } from '../lib/ring'
import { RingPortrait } from '../shell/RingPortrait'
import { send, useGame } from '../store/game'
import { STATS, type CrewMember, type RollView, type StatKey } from '../types'
import { RollClock } from './clock'
import { RollFX } from './rollfx'
import { LADDER, STAT_LOOK, dieIcon, effectiveDie, statIcon } from './stats'

// The R6 roll screen, on the roller's laptop only: Pick -> Rolling -> Done. The dice come from the server;
// this screen tells the server as each one lands, so everyone else sees the result at the same moment.

const FONTS = ['800 40px Doto', '40px VT323', '20px Silkscreen', '700 40px Archivo']

/** Canvas text can't wait for a webfont by itself, so ask for the roll faces early. */
export function preloadRollFonts() {
  FONTS.forEach((f) => document.fonts?.load?.(f).catch(() => undefined))
}

export function RollDialog() {
  const dialog = useGame((s) => s.dialog)
  const view = useGame((s) => s.view)
  if (!dialog || !view) return null
  const me = view.crew.find((c) => c.id === view.me.char)
  return (
    <div role="dialog" aria-label="Roll" aria-modal="true" className="app-rolldlg">
      {dialog.kind === 'pick' ? (
        me && <Pick me={me} initial={dialog.stat} initialEntry={dialog.entry ?? -1} />
      ) : (
        <Stage key={dialog.rollId} rollId={dialog.rollId} resume={dialog.resume} />
      )}
    </div>
  )
}

/** R6's top row: the roller's ring, their name, and Close. */
function Head({ roll, me, onClose }: { roll?: RollView; me?: CrewMember; onClose: () => void }) {
  const view = useGame((s) => s.view)
  const crew = roll?.char ? view?.crew.find((c) => c.id === roll.char) : me
  const tok = roll?.token && !roll.char ? view?.tokens[roll.token] : undefined
  return (
    <div className="app-rollhead">
      {crew ? (
        <RingPortrait src={crew.portrait} ring={ring(crew.hp, crew.entropy, 52, 7)} size={52} />
      ) : tok ? (
        <RingPortrait src={tok.portrait} ring={plainRing(tok.color, 52, 4)} size={52} />
      ) : null}
      <span className="r4-h" style={{ fontSize: 14 }}>
        {crew?.short ?? tok?.name ?? 'Just a die'}
      </span>
      {roll?.hidden && <span className="r5-role">Hidden from players</span>}
      <button type="button" className="r4-btn" onClick={onClose} style={{ marginLeft: 'auto', pointerEvents: 'auto' }}>
        Close
      </button>
    </div>
  )
}

function Pick({ me, initial, initialEntry }: { me: CrewMember; initial: StatKey; initialEntry: number }) {
  const closeDialog = useGame((s) => s.closeDialog)
  const openRoll = useGame((s) => s.openRoll)
  const [pick, setPick] = useState<StatKey>(initial)
  const [entry, setEntry] = useState(initialEntry)
  const [jig, setJig] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const E = effectiveDie(me.stats[pick], entry >= 0)

  const rollIt = async () => {
    setBusy(true)
    setErr('')
    const ack = await send('roll.start', { stat: pick, entry: entry >= 0 ? entry : null })
    setBusy(false)
    if (!ack.ok) {
      setErr(ack.code === 'offline' ? 'Not connected. Try again in a moment.' : ack.error || 'The dice did not come back.')
      return
    }
    const v = useGame.getState().view
    const mine = v?.rolls.find((r) => r.by === v.me.seat && r.open)
    if (mine) openRoll(mine.id)
  }

  return (
    <>
      <div className="app-pickstage">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28, height: 380 }}>
          {STATS.map((s) => {
            const L = STAT_LOOK[s]
            const on = s === pick
            const sides = on ? E.sides : me.stats[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setPick(s)
                  setJig((j) => j + 1)
                }}
                aria-label={`${L.title}, d${sides}`}
                aria-pressed={on}
                className="app-pickstat"
              >
                {on && (
                  <span
                    className="app-beam"
                    style={{ background: `linear-gradient(to top, ${L.col}, transparent)` }}
                  />
                )}
                <span style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: 144 }}>
                  <img src={dieIcon(s, sides)} alt="" className={on ? 'r4-die jig' + (jig % 2) : 'r4-die'} style={{ width: on ? 144 : 96, height: on ? 144 : 96 }} />
                </span>
                <img src={statIcon(s)} alt="" className="r3-px" style={{ position: 'relative', width: 48, height: 48 }} />
                <span className={on ? 'r4-lab on' : 'r4-lab'} style={{ position: 'relative' }}>
                  {L.name}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 22px', maxWidth: 1200, padding: '0 16px' }}>
          {me.list.map((k, i) => (
            <button
              key={k.name}
              type="button"
              className={entry === i ? 'r4-item r4-chip on' : 'r4-item r4-chip'}
              aria-pressed={entry === i}
              title={k.downside ? `Downside: ${k.downside}` : undefined}
              onClick={() => {
                setEntry(entry === i ? -1 : i)
                setJig((j) => j + 1)
              }}
            >
              {k.icon ? (
                <img src={k.icon} alt="" className="r3-px" style={{ width: 48, height: 48 }} />
              ) : (
                <span className="app-noicon" aria-hidden="true">
                  {k.kind === 'chrome' ? 'CHROME' : 'SKILL'}
                </span>
              )}
              <span>{k.name}</span>
            </button>
          ))}
        </div>
        <button type="button" className="r4-cta" onClick={rollIt} disabled={busy}>
          Roll it
        </button>
        <div className="app-error" role="alert" style={{ minHeight: 18 }}>
          {err}
        </div>
      </div>
      <Head me={me} onClose={closeDialog} />
    </>
  )
}

function Stage({ rollId, resume }: { rollId: string; resume: boolean }) {
  const roll = useGame((s) => s.view?.rolls.find((r) => r.id === rollId))
  const crew = useGame((s) => (roll?.char ? s.view?.crew.find((c) => c.id === roll.char) : undefined))
  const entryKind = crew?.list.find((e) => e.name === roll?.entry)?.kind ?? 'skill'
  const closeDialog = useGame((s) => s.closeDialog)
  const openPick = useGame((s) => s.openPick)
  const cv = useRef<HTMLCanvasElement | null>(null)
  const clock = useRef<RollClock | null>(null)
  const sent = useRef(0) // dice the server has been told have landed
  const [phase, setPhase] = useState<'rolling' | 'done'>(resume ? 'done' : 'rolling')
  const [gate, setGate] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [err, setErr] = useState('')

  const diceKey = roll?.dice?.join(',')
  const plan = useMemo(() => {
    if (!roll?.dice) return null
    const L = STAT_LOOK[roll.stat]
    return RollFX.plan({
      mode: L.mode,
      rolls: roll.dice,
      sides: roll.sides,
      bonus: roll.bonus ?? 0,
      seed: roll.seed ?? 1,
      color: L.fx,
      style: 'custom',
      aspect: 1.6,
      handle: roll.handle,
      insult: roll.insult,
    })
    // the plan is fixed by the server's dice and seed; later frames (pushes) don't change it
  }, [rollId, diceKey])

  // the world was reloaded under us (a preset): nothing left to show
  useEffect(() => {
    if (!roll) closeDialog()
  }, [roll, closeDialog])

  const ctx2d = () => {
    const c = cv.current
    if (!c) return null
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = c.clientWidth
    const h = c.clientHeight
    if (!w || !h) return null
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const x = c.getContext('2d')
    if (!x) return null
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { x, w, h }
  }

  const reveal = (k: number) => {
    if (k > sent.current) {
      sent.current = k
      void send('roll.reveal', { roll: rollId, shown: k })
    }
  }

  // The animation: frames paint while the tab is visible. A background tab gets no animation frames, so a
  // timer keeps the clock going there, and the dice still land for everyone on time.
  useEffect(() => {
    if (!plan || phase !== 'rolling') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const c = new RollClock(plan, performance.now() - (reduced ? 1e6 : 0), {
      land: reveal,
      gate: setGate,
      done: () => setPhase('done'),
    })
    clock.current = c
    let raf = 0
    const frame = () => {
      const f = c.tick(performance.now())
      const g = ctx2d()
      if (f && g) RollFX.draw(g.x, g.w, g.h, plan, f.t, f.wait ? { wait: f.wait } : { spent: 0 })
      if (!c.done) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const background = window.setInterval(() => {
      if (document.hidden) c.tick(performance.now())
    }, 250)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(background)
    }
  }, [plan])

  // Done: the settled frame, repainted for pushes, resizes and late fonts
  const pushed = roll?.pushed ?? 0
  useEffect(() => {
    if (!plan || phase !== 'done') return
    reveal(plan.passes.length)
    const paint = () => {
      const c = ctx2d()
      if (c) RollFX.draw(c.x, c.w, c.h, plan, 1e6, { spent: pushed })
    }
    paint()
    window.addEventListener('resize', paint)
    document.fonts?.ready?.then(paint)
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(paint, ms))
    return () => {
      window.removeEventListener('resize', paint)
      timers.forEach(clearTimeout)
    }
  }, [plan, phase, pushed])

  const close = () => {
    if (roll?.open) void send('roll.close', { roll: rollId })
    closeDialog()
  }
  /** Back to the picker for another roll, with the same stat and skill picked. */
  const reroll = () => {
    if (!roll) return
    if (roll.open) void send('roll.close', { roll: rollId })
    const entry = crew?.list.findIndex((e) => e.name === roll.entry) ?? -1
    closeDialog()
    openPick(roll.stat, entry)
  }
  const skip = () => clock.current?.skip()
  const release = () => clock.current?.release(performance.now())

  if (!roll?.dice) return null
  const dice = roll.dice
  const L = STAT_LOOK[roll.stat]
  const nat1 = dice[0] === 1
  const exploded = dice.length > 1
  const gain = exploded ? 2 : 1
  const bonus = roll.bonus ?? 0
  const total = dice.reduce((x, y) => x + y, 0) + bonus + pushed
  const entropy = crew?.entropy ?? 0
  const noPush = pushing || !roll.open || entropy <= 0 || roll.pushes >= 2 || nat1
  let breakdown = dice.join(' + ')
  if (bonus) breakdown += ` + ${bonus} ${entryKind}`
  if (pushed) breakdown += ` + ${pushed} push`
  if (nat1) breakdown = "You fail. Entropy can't save this."
  if (!bonus && !pushed && !exploded && !nat1) breakdown = ''

  const push = async () => {
    setPushing(true)
    const ack = await send('roll.push', { roll: rollId })
    setPushing(false)
    setErr(ack.ok ? '' : ack.code === 'offline' ? 'Not connected. Try again in a moment.' : ack.error || 'That push did not land.')
  }

  return (
    <>
      <canvas ref={cv} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div aria-live="polite" className="app-sr">
        {phase === 'done' ? (nat1 ? 'Natural 1, fails' : `Total ${total}`) : ''}
      </div>
      {phase === 'rolling' && !gate && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex', justifyContent: 'center' }}>
          <button type="button" className="r4-btn" onClick={skip}>
            Skip
          </button>
        </div>
      )}
      {phase === 'rolling' && gate && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center' }}>
          <button type="button" className="r4-cta" onClick={release}>
            Roll again
          </button>
        </div>
      )}
      {phase === 'done' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '0 16px' }}>
          <div style={{ minHeight: 22, color: '#fff' }}>{breakdown}</div>
          {!nat1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {LADDER.map(([name, v]) => {
                const met = total >= v
                return (
                  <div key={name} className={met ? 'r4-rung met' : 'r4-rung'}>
                    <span style={{ height: 2, background: met ? L.fx : 'var(--line)' }} />
                    <span>
                      {name} {v}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {err && (
            <div className="app-error" role="alert">
              {err}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {!nat1 && roll.char && (
              <button type="button" className="r4-btn" onClick={push} disabled={noPush}>
                Push +{gain} for 1 Entropy, {entropy} left
              </button>
            )}
            {!nat1 && roll.char && (
              <button type="button" className="r4-btn" onClick={reroll}>
                Reroll
              </button>
            )}
            <button type="button" className="r4-btn" onClick={close}>
              {nat1 ? 'Yeah. Okay.' : 'Back to the map'}
            </button>
          </div>
        </div>
      )}
      <Head roll={roll} onClose={close} />
    </>
  )
}
