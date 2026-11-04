import type { Vec3 } from '../types'

// The isometric projection every Maps board shares. One world unit is a 60x30 art-pixel diamond,
// one Z unit is 36 art pixels of height, and the art is drawn at 2x.
export function proj(origin: [number, number], [X, Y, Z]: Vec3): [number, number] {
  const [ox, oy] = origin
  return [((X - Y) * 30 + ox) * 2, ((X + Y) * 15 - Z * 36 + oy) * 2]
}

// Screen pixel (in the 2x world div) back to world coordinates, holding Z at the token's own height.
export function unproj(origin: [number, number], [sx, sy]: [number, number], Z: number): Vec3 {
  const [ox, oy] = origin
  const a = (sx / 2 - ox) / 30 // X - Y
  const b = (sy / 2 - oy + Z * 36) / 15 // X + Y
  const r = (n: number) => Math.round(n * 1000) / 1000
  return [r((a + b) / 2), r((b - a) / 2), Z]
}
