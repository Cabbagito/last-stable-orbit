import { useEffect, useRef } from 'react'
import type { CrewMember } from '../types'

/**
 * The GM's read-only look at one player's screen (Round 12): the app itself, loaded as that seat from
 * `/?as=<seat>`, whose socket the server feeds exactly that player's projection and refuses every action on.
 */
export function ViewAs({ who, onClose }: { who: CrewMember; onClose: () => void }) {
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    back.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="r10-va" role="dialog" aria-label={`Viewing as ${who.short}`}>
      <div className="r10-banner">
        <span className="r10-blab">VIEWING AS {who.short.toUpperCase()}</span>
        <span className="r10-bsub">Read-only. This is exactly what {who.short}'s screen shows right now.</span>
        <button ref={back} type="button" onClick={onClose}>
          Back to the GM tab
        </button>
      </div>
      <iframe className="app-vaframe" title={`${who.short}'s screen`} src={`/?as=${encodeURIComponent(who.id)}#scene`} />
    </div>
  )
}
