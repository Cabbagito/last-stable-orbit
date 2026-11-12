import { ChipFx } from '../fx/ChipFx'
import { ring } from '../lib/ring'
import { Orbit, calloutSpeech, isSpinning } from '../roll/Callout'
import { calloutsBy } from '../roll/callouts'
import { BurnCallout, Flare, burnSpeech, useBurnMark } from '../stage/BurnMark'
import { useGame } from '../store/game'
import { RingPortrait } from './RingPortrait'

/**
 * Top-right column of crew rings, for players and the GM's look through their screens. Everyone's HP and Entropy are
 * public; your own name is pink. The GM has the crew in their column instead (gm/GmScene.tsx).
 */
export function CrewRail() {
  const view = useGame((s) => s.view)
  const select = useGame((s) => s.select)
  const selected = useGame((s) => s.selected)
  const calls = useGame((s) => s.calls)
  useGame((s) => s.callTick) // re-render when a roll is over
  const burning = useBurnMark()
  if (!view) return null
  const callouts = calloutsBy(view.rolls, calls, Date.now(), (r) => r.char)
  const tokenOf = (charId: string) =>
    Object.values(view.tokens).find((t) => t.kind === 'crew' && t.ref === charId)?.id ?? null
  return (
    <nav aria-label="Crew" className="app-rail">
      {view.crew.map((c) => {
        const tok = tokenOf(c.id)
        const burn = burning?.char === c.id ? burning : null
        const call = burn ? undefined : callouts[c.id] // a Burn's mark takes the roll callout's place
        return (
          <div key={c.id} className="r10-railit">
            <button
              type="button"
              className="app-railbtn"
              aria-label={`${c.short}, HP ${c.hp} of ${c.health}, Entropy ${c.entropy} of ${c.entropy_max}` + (call ? `, ${calloutSpeech(call.r)}` : '') + (burn ? `, ${burnSpeech(burn)}` : '')}
              onClick={() => tok && select(selected === tok ? null : tok)}
            >
              <span className="app-railring">
                <ChipFx id={`c:${c.id}`} down={c.hp <= 0} style={{ position: 'relative', display: 'block', width: 64, height: 64 }}>
                  <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 64, 9, c.health, c.entropy_max)} size={64} />
                </ChipFx>
                {call && isSpinning(call.r) && <Orbit stat={call.r.stat} />}
                {burn && <Flare m={burn} />}
                {burn && <BurnCallout key={burn.at} m={burn} side="s-l" />}
              </span>
              <span className={c.id === view.me.char ? 'r4-rail-name me' : 'r4-rail-name'}>{c.short}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
