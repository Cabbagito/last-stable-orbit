import type { MapObject, View } from '../types'

// A selected object is "object:<map>/<object>", so one `selected` covers tokens and things in the world.
const PREFIX = 'object:'

export const objectKey = (mapId: string, objectId: string) => `${PREFIX}${mapId}/${objectId}`

export function findObject(view: View, key: string | null): { mapId: string; obj: MapObject } | null {
  if (!key?.startsWith(PREFIX)) return null
  const [mapId, objectId] = key.slice(PREFIX.length).split('/')
  const obj = view.maps[mapId]?.objects.find((o) => o.id === objectId)
  return obj ? { mapId, obj } : null
}

/** Whether a selection still points at something this viewer can see. */
export const stillThere = (view: View, key: string | null) => !!key && (!!view.tokens[key] || !!findObject(view, key))
