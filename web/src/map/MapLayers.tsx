import type { MapView } from '../types'

/** A map's art: one base per mood (the current one shown), patches its switches show, the glow, and gas. */
export function MapLayers({ map }: { map: MapView }) {
  const [W, H] = map.display
  const shown = (o: { mood: string; switch: string; value: number }) => (map.mood === o.mood && (map.values[o.switch] ?? 0) === o.value ? 1 : 0)
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
      {map.moods.map((m) =>
        m.glow ? (
          <div key={m.id} className="r3-glow" style={{ width: W, height: H, opacity: map.mood === m.id ? 1 : 0 }}>
            <img className="r3-hum" src={m.glow} alt="" draggable={false} style={{ width: W, height: H }} />
          </div>
        ) : null,
      )}
      {map.overlays
        .filter((o) => o.layer === 'gas')
        .map((o) => (
          <img key={o.id} className="r3-map app-gas" src={o.src} alt="" draggable={false} style={{ width: W, height: H, opacity: shown(o) }} />
        ))}
    </>
  )
}
