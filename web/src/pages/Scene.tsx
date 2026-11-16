import { fightOn } from '../fight/fights'
import { FightStrip } from '../fight/Strip'
import { GmScene } from '../gm/GmScene'
import { MoodBar } from '../gm/MoodBar'
import { TvCameraBar } from '../gm/TvCameraBar'
import { AwayBar, MapPicker } from '../gm/MapPicker'
import { MapView } from '../map/MapView'
import { SlotsLayer } from '../slots/Machine'
import { OverviewLayer } from '../overview/Overview'
import { Banners } from '../roll/Banner'
import { InspectCard } from '../map/InspectCard'
import { Sheet } from '../sheet/Sheet'
import { CrewRail } from '../shell/CrewRail'
import { HurtEdge, useMyStage } from '../shell/HurtEdge'
import { isReadOnly, useGame } from '../store/game'
import type { TokenView } from '../types'

/** SCENE: the sheet (or the GM's "In this scene" column) on the left, the current location's map filling the rest. */
export function Scene() {
  const view = useGame((s) => s.view)
  const gmMap = useGame((s) => s.gmMap)
  const readOnly = useGame(isReadOnly)
  const hurt = useMyStage() // a player's own screen reddens at the edges when they're hurt
  if (!view) return <div className="app-body app-wait">Docking…</div>
  const isGm = view.me.role === 'gm'
  const mapId = isGm && gmMap && view.maps[gmMap] ? gmMap : view.party_map
  const map = view.maps[mapId]
  const tokens = Object.values(view.tokens).filter((t) => t.map === mapId)
  const canMove = (t: TokenView) => !readOnly && (isGm || (t.kind === 'crew' && t.ref === view.me.char))
  const me = view.crew.find((c) => c.id === view.me.char)
  const fight = fightOn(view, mapId)

  return (
    <div className="app-body">
      {isGm ? <GmScene map={map} /> : me && <Sheet me={me} items={view.inventory[me.id] ?? []} />}
      <section aria-label="Current location map" className={'app-mapsec' + (hurt === 'down' ? ' app-isdown' : '')}>
        {map ? (
          <>
            <MapView key={map.id} map={map} tokens={tokens} canMove={canMove} />
            <HurtEdge stage={hurt} />
            <div className="app-placewrap">
              {isGm && <AwayBar map={map} />}
              {isGm && <TvCameraBar view={view} map={map} />}
              {isGm && <MoodBar map={map} />}
              {isGm ? (
                <button type="button" className="gx-placebtn" aria-haspopup="dialog" title="Go somewhere else (M)" onClick={() => useGame.getState().setMapPicker({ token: null })}>
                  <span className="r4-place">{map.name}</span>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 8l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              ) : (
                <div className="r4-place">{map.name}</div>
              )}
              {map.subtitle && <div style={{ color: 'var(--dim)', marginTop: 2 }}>{map.subtitle}</div>}
            </div>
          </>
        ) : (
          <div className="app-wait">Somewhere the map doesn't reach.</div>
        )}
        {fight && <FightStrip key={fight.map} fight={fight} />}
        <Banners where="scene" low={!!fight} />
        {!isGm && <CrewRail />}
        <InspectCard />
        {isGm && <MapPicker />}
        {!isGm && <SlotsLayer />}
        {!isGm && <OverviewLayer />}
      </section>
    </div>
  )
}
