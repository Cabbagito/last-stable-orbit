import { proj } from '../lib/proj'
import type { DecalDef, FeedDef, Hum, MapView } from '../types'

const HUM: Record<Hum, string> = { bar: 'r3-hum', street: 'r3-hum app-hum-street', none: 'app-hum-none', beat: 'app-hum-none app-hum-beat' }

/**
 * A map's art, in its board's order: one base per mood (the current one shown), patches its switches show,
 * decals (the black hole moving in a window), the glow, decals over the glow (the Terminal room's face), gas,
 * the Terminal room's station feed, and the camera cones while the map's Cameras switch is on. Everyone sees
 * the cones: dodging them is part of play.
 */
export function MapLayers({ map }: { map: MapView }) {
  const [W, H] = map.display
  const shown = (o: { mood: string; switch: string; value: number }) => (map.mood === o.mood && (map.values[o.switch] ?? 0) === o.value ? 1 : 0)
  const cams = map.cameras && (map.values[map.cameras.switch] ?? 0) ? map.cameras.cones.filter((c) => c.mood === null || c.mood === map.mood) : []
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
      {map.decals
        .filter((d) => !d.over)
        .map((d) => (
          <Decal key={d.id} d={d} mood={map.mood} />
        ))}
      {map.moods.map((m) =>
        m.glow ? (
          <div key={m.id} className="r3-glow" style={{ width: W, height: H, opacity: map.mood === m.id ? 1 : 0 }}>
            <img className={HUM[m.hum]} src={m.glow} alt="" draggable={false} style={{ width: W, height: H }} />
          </div>
        ) : null,
      )}
      {map.decals
        .filter((d) => d.over)
        .map((d) => (
          <Decal key={d.id} d={d} mood={map.mood} />
        ))}
      {map.overlays
        .filter((o) => o.layer === 'gas')
        .map((o) => (
          <img key={o.id} className="r3-map app-gas" src={o.src} alt="" draggable={false} style={{ width: W, height: H, opacity: shown(o) }} />
        ))}
      {map.feed && <Feed f={map.feed} values={map.values} />}
      {cams.length > 0 && map.cameras && (
        <svg className="app-cones" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" style={{ fill: map.cameras.color, stroke: map.cameras.color }}>
          {cams.map((c, i) => (
            <polygon key={i} points={c.pts.map(([x, y]) => proj(map.origin, [x, y, 0]).join(',')).join(' ')} />
          ))}
        </svg>
      )}
    </>
  )
}

function Decal({ d, mood }: { d: DecalDef; mood: string }) {
  const op = Object.keys(d.opacity).length ? d.opacity[mood] ?? 0 : !d.moods.length || d.moods.includes(mood) ? 1 : 0
  return (
    <div
      className="app-decal"
      style={{
        width: d.box[0],
        height: d.box[1],
        transform: `matrix(${d.matrix.join(',')})`,
        opacity: op,
        mixBlendMode: (d.blend ?? undefined) as React.CSSProperties['mixBlendMode'],
        transition: `opacity ${d.fade}s ease-in`,
      }}
    >
      <img
        src={d.src}
        alt=""
        draggable={false}
        style={{
          left: d.img[0],
          top: d.img[1],
          width: d.img[2],
          height: d.img[3],
          filter: d.filter ?? undefined,
          clipPath: d.clip ?? undefined,
          imageRendering: d.pixelated ? 'pixelated' : undefined,
        }}
      />
    </div>
  )
}

/** The station feed: the clock down here and up top, then each event as it happens, the newest in white. */
function Feed({ f, values }: { f: FeedDef; values: Record<string, number> }) {
  const here = values[f.minutes] ?? 0
  const n = values[f.events] ?? 0
  return (
    <div className="app-feed" style={{ width: f.box[0], height: f.box[1], transform: `matrix(${f.matrix.join(',')})` }} aria-hidden="true">
      <div className="app-feed-h">{f.title}</div>
      <div>
        HERE {here} MIN / UP TOP {Math.round(here * f.factor * 10) / 10} MIN
      </div>
      {f.lines.slice(0, n).map((t, i) => (
        <div key={i} style={{ color: i === n - 1 ? '#ffffff' : '#8a80c8' }}>
          {t}
        </div>
      ))}
    </div>
  )
}
