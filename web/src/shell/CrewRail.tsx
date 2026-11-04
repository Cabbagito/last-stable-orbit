import { ring } from '../lib/ring'
import { useGame } from '../store/game'
import { RingPortrait } from './RingPortrait'

/** Top-right column of crew rings. Everyone's HP and Entropy are public; your own name is pink. */
export function CrewRail() {
  const view = useGame((s) => s.view)
  const select = useGame((s) => s.select)
  const selected = useGame((s) => s.selected)
  if (!view) return null
  const tokenOf = (charId: string) =>
    Object.values(view.tokens).find((t) => t.kind === 'crew' && t.ref === charId)?.id ?? null
  return (
    <nav aria-label="Crew" className="app-rail">
      {view.crew.map((c) => {
        const tok = tokenOf(c.id)
        return (
          <button
            key={c.id}
            type="button"
            className="app-railbtn"
            aria-label={`${c.short}, HP ${c.hp} of 6, Entropy ${c.entropy} of 6`}
            onClick={() => tok && select(selected === tok ? null : tok)}
          >
            <RingPortrait src={c.portrait} ring={ring(c.hp, c.entropy, 64, 9)} size={64} />
            <span className={c.id === view.me.char ? 'r4-rail-name me' : 'r4-rail-name'}>{c.short}</span>
          </button>
        )
      })}
    </nav>
  )
}
