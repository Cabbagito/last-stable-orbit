import type { FloorDef, Vec3 } from '../types'

/** Which deck of a tower map a height is on: the highest floor at or below it. */
export function floorOf(floors: FloorDef[], z: number): number {
  let i = 0
  floors.forEach((f, k) => {
    if (f.z <= z + 0.01) i = k
  })
  return i
}

/** The same spot on another deck: straight up or down, keeping X and Y and the height above the floor. */
export function onFloor(floors: FloorDef[], at: Vec3, to: number): Vec3 {
  const from = floors[floorOf(floors, at[2])]
  return [at[0], at[1], Math.round((floors[to].z + (at[2] - from.z)) * 1000) / 1000]
}
