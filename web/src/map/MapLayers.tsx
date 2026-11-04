import { proj } from '../lib/proj'
import type { MapView } from '../types'

const HUM = { bar: 'r3-hum', street: 'r3-hum app-hum-street', none: 'app-hum-none' }

/**
 * A map's art, in its board's order: one base per mood (the current one shown), patches its switches show,
 * decals (the black hole moving in a window), the glow, gas, and the camera cones while the map's Cameras
 * switch is on. Everyone sees the cones: dodging them is part of play.
 */
export function MapLayers({ map }: { map: MapView }) {
  const [W, H] = map.display
  const shown = (o: { mood: string; switch: string; value: number }) => (map.mood === o.mood && (map.values[o.switch] ?? 0) === o.value ? 1 : 0)
  const cams = map.cameras && (map.values[map.cameras.switch] ?? 0) ? map.cameras.cones.filter((c) => c.mood === map.mood) : []
  return (
    <>
      <div role="img" aria-label={map.description} />
      {map.moods.map((m) => (
        <img key={m.id} className="r3-map" src={m.base} alt="" draggable={false} style={{ width: W, height: H, opacity: map.mood === m.id ? 1 : 0 }} />
      ))}
      {map.overlays
        .filter((o) => o.layer === 'patch')
        .map((o) => (
          <img key={o.id} className="r3-map" src={o.src} alt="" draggable={false} style={{ width: W, height: H, opacity: shown(o) }} />
        ))}
      {map.decals.map((d) => (
        <div
          key={d.id}
          className="app-decal"
          style={{
            width: d.box[0],
            height: d.box[1],
            transform: `matrix(${d.matrix.join(',')})`,
            opacity: !d.moods.length || d.moods.includes(map.mood) ? 1 : 0,
          }}
        >
          <img src={d.src} alt="" draggable={false} style={{ left: d.img[0], top: d.img[1], width: d.img[2], height: d.img[3], filter: d.filter ?? undefined }} />
        </div>
      ))}
      {map.moods.map((m) =>
        m.glow ? (
          <div key={m.id} className="r3-glow" style={{ width: W, height: H, opacity: map.mood === m.id ? 1 : 0 }}>
            <img className={HUM[map.hum]} src={m.glow} alt="" draggable={false} style={{ width: W, height: H }} />
          </div>
        ) : null,
      )}
      {map.overlays
        .filter((o) => o.layer === 'gas')
        .map((o) => (
          <img key={o.id} className="r3-map app-gas" src={o.src} alt="" draggable={false} style={{ width: W, height: H, opacity: shown(o) }} />
        ))}
      {cams.length > 0 && (
        <svg className="app-cones" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          {cams.map((c, i) => (
            <polygon key={i} points={c.pts.map(([x, y]) => proj(map.origin, [x, y, 0]).join(',')).join(' ')} />
          ))}
        </svg>
      )}
    </>
  )
}
