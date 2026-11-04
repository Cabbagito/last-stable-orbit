import { useEffect, useState } from 'react'
import { gmRun } from '../store/game'
import type { MapView, View } from '../types'

/** The maps in the order the story reaches them. */
export function mapList(view: View): MapView[] {
  return Object.values(view.maps).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/** How many crew tokens stand on each map. */
export function crewOn(view: View, mapId: string) {
  return Object.values(view.tokens).filter((t) => t.kind === 'crew' && t.map === mapId).length
}

/**
 * "Send the crew here": the whole crew lands at the map's entrance, and it becomes the party's map, so every
 * player's screen moves there. It asks twice, because it moves everyone at once.
 */
export function SendCrew({ view, map }: { view: View; map: MapView }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => setArmed(false), [map.id])
  if (!map.arrive) return null
  const total = view.crew.length
  const here = crewOn(view, map.id)
  if (here === total) return <div className="r5-role">The whole crew is here.</div>
  return (
    <div className="app-send" role="group" aria-label={`Send the crew to ${map.name}`}>
      {armed ? (
        <>
          <button
            type="button"
            className="r12-go"
            onClick={() => {
              setArmed(false)
              void gmRun('gm.crew.send', { map: map.id })
            }}
          >
            Send all {total} now
          </button>
          <button type="button" className="r10-btn" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="r10-btn" onClick={() => setArmed(true)}>
          Send the crew here
        </button>
      )}
      <span className="r10-dimtxt">
        {armed ? "They land at the entrance, and everyone's screen moves here." : here ? `${here} of ${total} crew here.` : 'No crew here.'}
      </span>
    </div>
  )
}
