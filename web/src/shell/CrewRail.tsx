import { Vitals } from '../gm/parts'
import { ring } from '../lib/ring'
import { Callout, Orbit, calloutKey, calloutSpeech, isSpinning } from '../roll/Callout'
import { calloutsBy } from '../roll/callouts'
import { useGame } from '../store/game'
import { RingPortrait } from './RingPortrait'

/**
 * Top-right column of crew rings. Everyone's HP and Entropy are public; your own name is pink. The GM gets HP
 * and Entropy steppers beside a ring on hover (Round 12).
 */
export function CrewRail() {
  const view = useGame((s) => s.view)
  const select = useGame((s) => s.select)
  const selected = useGame((s) => s.selected)
  const calls = useGame((s) => s.calls)
  useGame((s) => s.callTick) // re-render when a callout fades
  if (!view) return null
  const isGm = view.me.role === 'gm'
  const callouts = calloutsBy(view.rolls, calls, Date.now(), (r) => r.char)
  const tokenOf = (charId: string) =>
    Object.values(view.tokens).find((t) => t.kind === 'crew' && t.ref === charId)?.id ?? null
  return (
    <nav aria-label="Crew" className="app-rail">
      {view.crew.map((c) => {
        const tok = tokenOf(c.id)
        const call = callouts[c.id]
        return (
          <div key={c.id} className="r10-railit">
            <button
              type="button"
              className="app-railbtn"
              aria-label={`${c.short}, HP ${c.hp} of 6, Entropy ${c.entropy} of 6` + (call ? `, ${calloutSpeech(call.r)}` : '')}
              onClick={() => tok && select(selected === tok ? null : tok)}
            >
              <span className="app-railring">
                <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 64, 9)} size={64} />
                {call && isSpinning(call.r) && <Orbit stat={call.r.stat} />}
                {call && <Callout key={calloutKey(call.r)} r={call.r} side="s-l" fading={call.fading} />}
              </span>
              <span className={c.id === view.me.char ? 'r4-rail-name me' : 'r4-rail-name'}>{c.short}</span>
            </button>
            {isGm && (
              <div className="r10-railstep">
                <Vitals c={c} />
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
