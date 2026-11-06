import { useEffect, useRef, useState } from 'react'
import { send, useGame } from '../store/game'
import type { CrewMember, View } from '../types'

export const BURN_COST = 2
const HOLD_MS = 500 // hold the row this long to burn; let go early and nothing is spent
const FLASH_MS = 130
const FADE_MS = 350
const REACT_MS = 5000 // Recount and Not them pulse this long after a die lands or someone is hurt
const EN = '#f2b544'
const OFF = '#2a2a31'

type Phase = 'idle' | 'hold' | 'flash' | 'fade'

/**
 * The Burn row (the Burn animations canvas, boards "The Burn row in the sheet" and "every state"): under the name,
 * right below the ring that pays for it. Hold it for half a second to spend 2 Entropy and play the film; let go
 * early to cancel. Two lit pips when it's affordable; dim, with holding doing nothing, when it isn't. Tomo's row
 * pulses for 5 seconds after one of the others is hurt, and Tally's after a die lands. That never blocks
 * anything: the Burn still works once the line runs out. The player says who it's aimed at; Peter applies it.
 */
export function BurnRow({ me, cut, tip }: { me: CrewMember; cut: string | null; tip: { on: boolean; enter: (el: HTMLElement) => void; leave: () => void } }) {
  const b = me.burn
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState('')
  const timer = useRef(0)
  const until = useReact(me)
  const [, tick] = useState(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!until) return
    const t = window.setTimeout(() => tick((n) => n + 1), Math.max(0, until - Date.now()) + 20)
    return () => window.clearTimeout(t)
  }, [until])
  if (!b) return null
  const can = me.entropy >= BURN_COST
  const reacting = !!until && Date.now() < until && phase === 'idle'

  const fire = async () => {
    setPhase('flash')
    timer.current = window.setTimeout(() => {
      setPhase('fade')
      timer.current = window.setTimeout(() => setPhase('idle'), FADE_MS)
    }, FLASH_MS)
    const ack = await send('burn.use', cut ? { cut } : {})
    setErr(ack.ok ? '' : ack.code === 'offline' ? 'Not connected. Try again in a moment.' : ack.code === 'read_only' ? '' : ack.error || 'That Burn did not go off.')
  }
  const start = () => {
    if (!can || phase !== 'idle') return
    setErr('')
    window.clearTimeout(timer.current)
    setPhase('hold')
    timer.current = window.setTimeout(() => void fire(), HOLD_MS)
  }
  const stop = () => {
    if (phase !== 'hold') return
    window.clearTimeout(timer.current)
    setPhase('idle')
  }

  const fill =
    phase === 'hold'
      ? { width: '100%', opacity: 1, background: b.color + '3d', boxShadow: `inset -2px 0 0 ${b.color}`, transition: `width ${HOLD_MS}ms linear` }
      : phase === 'flash'
        ? { width: '100%', opacity: 1, background: b.color + 'c4', boxShadow: 'none', transition: 'none' }
        : phase === 'fade'
          ? { width: '100%', opacity: 0, background: b.color + 'c4', boxShadow: 'none', transition: `opacity ${FADE_MS}ms linear` }
          : { width: '0%', opacity: 1, background: b.color + '3d', boxShadow: `inset -2px 0 0 ${b.color}`, transition: 'width .12s ease-out' }
  const lit = phase === 'flash'
  return (
    <>
      <button
        type="button"
        className={'app-burn' + (can ? '' : ' broke') + (reacting ? ' react' : '') + (tip.on ? ' on' : '')}
        style={{ '--bc': b.color } as React.CSSProperties}
        aria-label={`Burn: ${b.name}. ${can ? `Hold to spend ${BURN_COST} Entropy.` : `It needs ${BURN_COST} Entropy; you have ${me.entropy}.`}`}
        aria-describedby={tip.on ? 'app-sheettip' : undefined}
        aria-disabled={!can}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          start()
        }}
        onPointerUp={stop}
        onPointerLeave={() => {
          stop()
          tip.leave()
        }}
        onPointerEnter={(e) => tip.enter(e.currentTarget)}
        onFocus={(e) => tip.enter(e.currentTarget)}
        onBlur={() => {
          stop()
          tip.leave()
        }}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault()
            start()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stop()
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="app-burn-fill" style={fill} />
        <img src={b.icon} alt="" draggable={false} className="r3-px" style={{ opacity: can ? 1 : 0.35 }} />
        <span className="app-burn-txt">
          <span className="app-burn-lab" style={{ color: lit ? '#000' : can ? '#8a8e96' : '#44474d' }}>
            BURN
          </span>
          <span className="app-burn-name" style={{ color: lit ? '#000' : can ? '#eceef1' : '#5e626a' }}>
            {b.name}
          </span>
        </span>
        <span className="app-burn-pips" aria-hidden="true">
          <span style={{ background: me.entropy >= 1 ? EN : OFF }} />
          <span style={{ background: me.entropy >= 2 ? EN : OFF }} />
        </span>
        {reacting && <span key={until} className="app-burn-drain" />}
      </button>
      {err && (
        <div className="app-error" role="alert" style={{ marginTop: -4 }}>
          {err}
        </div>
      )}
    </>
  )
}

/** Ves's two cuts: the film with the slash, in a fight, and the quiet one, when she just vanishes. */
export function BurnCuts({ me, cut, onCut }: { me: CrewMember; cut: string | null; onCut: (c: string) => void }) {
  const cuts = me.burn?.cuts ?? []
  if (cuts.length < 2) return null
  const on = cut ?? cuts[0].id
  return (
    <div className="app-burncuts" role="group" aria-label={`Which ${me.burn!.name}`}>
      {cuts.map((c) => (
        <button key={c.id} type="button" className={on === c.id ? 'on' : ''} aria-pressed={on === c.id} onClick={() => onCut(c.id)}>
          {c.label || c.id}
        </button>
      ))}
    </div>
  )
}

/**
 * When this Burn's moment comes: a public die landing (Recount), or one of the others losing health (Not them).
 * Returns when the pulse ends, in Date.now() ms, or 0.
 */
function useReact(me: CrewMember): number {
  const view = useGame((s) => s.view)
  const [until, setUntil] = useState(0)
  const last = useRef<{ landed: Set<string>; hp: Record<string, number> } | null>(null)
  const react = me.burn?.react
  useEffect(() => {
    if (!view || !react) return
    const now = snapshot(view, me.id)
    const prev = last.current
    last.current = now
    if (!prev) return // the first frame after connecting: nothing has just happened
    const hit =
      react === 'roll'
        ? [...now.landed].some((id) => !prev.landed.has(id))
        : Object.entries(now.hp).some(([c, hp]) => prev.hp[c] !== undefined && hp < prev.hp[c])
    if (hit) setUntil(Date.now() + REACT_MS)
  }, [view, react, me.id])
  return until
}

function snapshot(view: View, self: string) {
  const landed = new Set(view.rolls.filter((r) => !r.hidden && !r.sealed && r.phase !== 'roll' && r.phase !== 'boom').map((r) => r.id))
  const hp = Object.fromEntries(view.crew.filter((c) => c.id !== self).map((c) => [c.id, c.hp]))
  return { landed, hp }
}
