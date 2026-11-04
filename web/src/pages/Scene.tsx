import { GmPanel } from '../gm/GmPanel'
import { MapView } from '../map/MapView'
import { InspectCard } from '../map/InspectCard'
import { Sheet } from '../sheet/Sheet'
import { CrewRail } from '../shell/CrewRail'
import { useGame } from '../store/game'
import type { TokenView } from '../types'

/** SCENE: the sheet (or the GM column) on the left, the current location's map filling the rest. */
export function Scene() {
  const view = useGame((s) => s.view)
  const gmMap = useGame((s) => s.gmMap)
  if (!view) return <div className="app-body app-wait">Docking…</div>
  const isGm = view.me.role === 'gm'
  const mapId = isGm && gmMap && view.maps[gmMap] ? gmMap : view.party_map
  const map = view.maps[mapId]
  const tokens = Object.values(view.tokens).filter((t) => t.map === mapId)
  const canMove = (t: TokenView) => isGm || (t.kind === 'crew' && t.ref === view.me.char)
  const me = view.crew.find((c) => c.id === view.me.char)

  return (
    <div className="app-body">
      {isGm ? <GmPanel map={map} /> : me && <Sheet me={me} items={view.inventory[me.id] ?? []} />}
      <section aria-label="Current location map" className="app-mapsec">
        {map ? (
          <>
            <MapView key={map.id} map={map} tokens={tokens} canMove={canMove} />
            <div className="app-place">
              <div className="r4-place">{map.name}</div>
              {map.subtitle && <div style={{ color: 'var(--dim)', marginTop: 2 }}>{map.subtitle}</div>}
            </div>
          </>
        ) : (
          <div className="app-wait">Somewhere the map doesn't reach.</div>
        )}
        <CrewRail />
        <InspectCard />
      </section>
    </div>
  )
}
