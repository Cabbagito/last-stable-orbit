// The God roll's falling die, drawn in fat pixels: R17Stage's paintGod and its seeds, with the state passed in.
// It paints the same picture on every screen, because it runs off seconds since the server rolled.

export const T_HIT = 2.8 // seconds: when the die hits
export const T_OFF = 5.6 // when the screen starts to come back
export const T_END = 6.8 // when it's gone

const TAU = Math.PI * 2
const PHI = (1 + Math.sqrt(5)) / 2
const V: number[][] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map((v) => v.map((n) => n / Math.hypot(1, PHI)))
const F: number[][] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
export const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

const r = rng(11)
const motes = Array.from({ length: 80 }, () => ({ x: r(), y: r(), v: 0.2 + 0.8 * r(), k: 0.2 + 0.8 * r() }))
const bits = Array.from({ length: 150 }, () => {
  const a = r() * TAU
  const s = 40 + 210 * r() * r()
  return { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 40, k: 0.4 + 0.6 * r(), sz: r() < 0.3 ? 2 : 1 }
})
const cracks = Array.from({ length: 13 }, (_, i) => {
  let a = (i / 13) * TAU + r() * 0.35
  let x = 0
  let y = 0
  const pts: [number, number][] = [[0, 0]]
  const n = 5 + Math.floor(r() * 4)
  for (let j = 0; j < n; j++) {
    const d = 16 + r() * 26
    a += (r() - 0.5) * 0.9
    x += Math.cos(a) * d
    y += Math.sin(a) * d * 0.72
    pts.push([x, y])
  }
  return pts
})

export interface GodLook {
  hidden: boolean // no number: after it lands, the die goes black and you can't read it
  tint: [number, number, number]
  tv: boolean
}

/** How much the screen shakes and grows at `t` seconds, from R17Stage's frame(). */
export function godShake(t: number, now: number): { dx: number; dy: number; sc: number } {
  const u = clamp01(t / T_HIT)
  const amp = t < T_HIT ? 7 * u * u * u : 34 * Math.exp(-(t - T_HIT) * 4.2)
  return {
    dx: (Math.sin(now * 0.09) + Math.sin(now * 0.163)) * amp * 0.6,
    dy: (Math.sin(now * 0.071) + Math.sin(now * 0.137)) * amp * 0.6,
    sc: 1 + 0.05 * Math.min(u, 1),
  }
}

export function paintGod(c: HTMLCanvasElement, t: number, g: GodLook) {
  const W = 360
  const H = 225
  if (c.width !== W) {
    c.width = W
    c.height = H
  }
  const x = c.getContext('2d')
  if (!x) return
  const hit = t >= T_HIT
  const since = t - T_HIT
  const u = clamp01(t / T_HIT)
  const cx = W / 2
  const cy = H * 0.48
  const R = g.tv ? 70 : 60
  const tint = g.tint
  x.clearRect(0, 0, W, H)

  // a shaft of light from above, opening as the die comes down
  const open = clamp01((t - 0.2) / 0.8)
  const flare = hit ? Math.exp(-since * 1.5) : 0
  const shaft = open * (0.05 + 0.13 * u) * (hit ? 0.55 + 0.45 * Math.exp(-since) : 1) + flare * 0.2
  for (let y = 0; y < H; y++) {
    const half = (8 + y * 0.2) * (1 + flare * 1.6)
    x.fillStyle = 'rgba(255,240,226,' + (shaft * (1 - (y / H) * 0.75)).toFixed(3) + ')'
    x.fillRect(Math.round(cx - half), y, Math.round(half * 2), 1)
  }
  // dust, pulled up into the light
  for (const m of motes) {
    const y = (m.y - t * m.v * 0.13 * (1 + 2 * u)) % 1
    const yy = (y < 0 ? y + 1 : y) * H
    const mx = cx + (m.x - 0.5) * (20 + yy * 0.42)
    x.fillStyle = 'rgba(255,240,226,' + (open * 0.5 * m.k * (hit ? Math.max(0, 1 - since * 0.5) : 1)).toFixed(3) + ')'
    x.fillRect(Math.round(mx), Math.round(yy), 1, 1)
  }

  // the floor cracks where it hit
  if (hit) {
    const grow = clamp01(since / 0.13)
    const fade = clamp01(1 - (since - 1.6) / 1.2)
    x.lineWidth = 1
    x.strokeStyle = since < 0.25 ? 'rgba(255,255,255,' + fade + ')' : 'rgba(255,91,77,' + (0.75 * fade).toFixed(3) + ')'
    x.beginPath()
    for (const pts of cracks) {
      const m = Math.max(1, Math.floor(pts.length * grow))
      x.moveTo(Math.round(cx + pts[0][0]), Math.round(cy + R * 0.55 + pts[0][1]))
      for (let i = 1; i < m; i++) x.lineTo(Math.round(cx + pts[i][0]), Math.round(cy + R * 0.55 + pts[i][1]))
    }
    x.stroke()
    // the shock wave
    const rr = since * 330
    const a = clamp01(1 - since / 0.75)
    if (a > 0) {
      x.lineWidth = 3
      x.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'
      x.beginPath()
      x.ellipse(cx, cy + R * 0.55, rr, rr * 0.62, 0, 0, TAU)
      x.stroke()
    }
  }

  // the die: a slow fall that turns into a slam
  const fall = Math.pow(u, 3.1)
  const y0 = -R * 1.4
  const yc = y0 + (cy - y0) * fall
  const spin = hit ? T_HIT * 1.7 + (1 - Math.exp(-since * 5)) * 0.35 : t * (0.5 + 1.2 * u)
  const wob = hit ? Math.sin(since * 16) * Math.exp(-since * 5) * 0.14 : 0
  const a1 = spin * 1.3 + wob
  const a2 = spin * 0.9
  const ca = Math.cos(a1)
  const sa = Math.sin(a1)
  const cb = Math.cos(a2)
  const sb = Math.sin(a2)
  const rot = (v: number[]) => {
    const y1 = v[1] * ca - v[2] * sa
    const z1 = v[1] * sa + v[2] * ca
    return [v[0] * cb + z1 * sb, y1, -v[0] * sb + z1 * cb]
  }
  const pts = V.map(rot)
  const faces = F.map((f) => {
    const a = pts[f[0]]
    const b = pts[f[1]]
    const d = pts[f[2]]
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = d[0] - a[0]
    const vy = d[1] - a[1]
    const vz = d[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    const mx = a[0] + b[0] + d[0]
    const my = a[1] + b[1] + d[1]
    const mz = a[2] + b[2] + d[2]
    if (nx * mx + ny * my + nz * mz < 0) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    return { f, nz, lit: Math.max(0, nx * -0.35 + ny * -0.82 + nz * 0.45), z: mz }
  })
    .filter((q) => q.nz > 0)
    .sort((p, q) => p.z - q.z)
  // after it lands, a hidden die goes black: you can't read it. A public one sinks behind its number.
  const dark = hit ? clamp01(since / 0.5) : 0
  const rim = g.hidden ? 1 - dark * 0.45 : 1 - dark * 0.78
  const glow = hit ? Math.exp(-since * 2.6) : u * u * 0.9
  if (glow > 0.02) {
    for (let k = 3; k > 0; k--) {
      x.fillStyle = 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',' + (0.07 * glow).toFixed(3) + ')'
      x.beginPath()
      x.arc(cx, yc, R * (1 + k * 0.2), 0, TAU)
      x.fill()
    }
  }
  x.lineJoin = 'round'
  for (const q of faces) {
    const s = 10 + 62 * Math.pow(q.lit, 1.4) * (g.hidden ? 1 - dark : 1 - dark * 0.7)
    const k = g.hidden ? 1 : 0.55
    const col = [0, 1, 2].map((i) => Math.round(s * (g.hidden ? 1 : (tint[i] / 255) * 1.5) * k + (g.hidden ? 0 : 4)))
    x.fillStyle = 'rgb(' + col.join(',') + ')'
    x.strokeStyle = 'rgba(255,255,255,' + (0.92 * rim).toFixed(3) + ')'
    x.lineWidth = 1
    x.beginPath()
    q.f.forEach((i, j) => {
      const px = cx + pts[i][0] * R
      const py = yc + pts[i][1] * R
      if (j) x.lineTo(px, py)
      else x.moveTo(px, py)
    })
    x.closePath()
    x.fill()
    x.stroke()
  }

  // debris thrown out by the hit
  if (hit && since < 1.6) {
    for (const b of bits) {
      const bx = cx + b.vx * since
      const by = cy + R * 0.55 + b.vy * since + 150 * since * since
      x.fillStyle = 'rgba(255,' + (since < 0.3 ? 255 : 170) + ',' + (since < 0.3 ? 255 : 120) + ',' + (clamp01(1 - since / 1.5) * b.k).toFixed(3) + ')'
      x.fillRect(Math.round(bx), Math.round(by), b.sz, b.sz)
    }
  }
  // one hard white frame
  if (hit && since < 0.24) {
    x.fillStyle = 'rgba(255,255,255,' + (since < 0.05 ? 1 : 1 - (since - 0.05) / 0.19).toFixed(3) + ')'
    x.fillRect(0, 0, W, H)
  }
}
