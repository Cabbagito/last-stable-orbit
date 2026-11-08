import type { MapView, TokenView, View } from '../types'

/** What the picker shows first: where things are happening, then where you just were. */
export interface NowTile {
  map: string
  lab: string
  fight: number | null // its round, when there's a fight on
}

const crewHere = (view: View, mapId: string) => Object.values(view.tokens).filter((t) => t.kind === 'crew' && t.map === mapId)

export function nowTiles(view: View, last: string | null): NowTile[] {
  const round = (m: string) => {
    const f = view.fights?.find((x) => x.map === m)
    return f ? (f.round ?? 1) : null
  }
  const tiles: NowTile[] = [{ map: view.party_map, lab: 'The party', fight: round(view.party_map) }]
  const has = (m: string) => tiles.some((t) => t.map === m)
  for (const t of Object.values(view.tokens)) {
    if (t.kind === 'crew' && !has(t.map)) tiles.push({ map: t.map, lab: 'Split off', fight: round(t.map) })
  }
  for (const f of view.fights ?? []) {
    if (!has(f.map)) tiles.push({ map: f.map, lab: 'A fight', fight: f.round ?? 1 })
  }
  if (last && view.maps[last] && !has(last)) tiles.push({ map: last, lab: 'Last looked at', fight: null })
  return tiles
}

export const crewFaces = (view: View, mapId: string): TokenView[] => {
  const order = view.crew.map((c) => c.id)
  return crewHere(view, mapId).sort((a, b) => order.indexOf(a.ref) - order.indexOf(b.ref))
}

export const moodArt = (m: MapView) => (m.moods.find((x) => x.id === m.mood) ?? m.moods[0]).base

/** The crew hasn't reached it, nobody's there and the Station hasn't shown it: dimmed, but still yours to open. */
export function isFar(view: View, mapId: string) {
  const place = view.station?.places.find((p) => p.id === mapId)
  return !!place && !place.lit && crewHere(view, mapId).length === 0
}
