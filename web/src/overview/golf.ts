// The green and its rules, from the Mini-golf canvas's "drag to putt" board (https://claude.ai/artifact/LdXDGzq7yTFWV4s13G5h3y).
// Metres on the floor: x across the green, z down it from the tee. Screen points are the canvas's 384 x 216 pixels.
import type { GolfGreen } from '../types'

export const W = 384
export const H = 216
export const K = 6 // the controls' sharper canvas, per game pixel
const F = 360
export const CX = 192
export const CY = 108
const CAMH = 1.35
const CAMZ = -2.2
const PITCH = 0.2
const CP = Math.cos(PITCH)
const SP = Math.sin(PITCH)
export const HALF = 1.2
export const BACK = 9.0
export const TEE = 0.9
export const HOLE = { x: 0.25, z: 8.2 }
export const CUP = 0.13
export const BR = 0.035
export const WR = 0.8
export const DUCT: [number, number] = [-1.05, -0.45]
export const SWZ = 4.2
export const SWX = 0.8
const SWP = 4.4
export const SWHX = 0.24
export const SWHZ = 0.14
export const SWH = 0.24
export const TP = { x: 0, z: 6.2 }
export const ARM = 0.72
export const OMEGA = 0.85
const BART = 0.03
const POST = 0.07
const MU = 0.95
const LIPV = 1.7
const WELLMU = 0.42
const CURVEK = 0.055
export const LWALL = -1.5
export const RWALL = 1.8
export const WALLH = 2.8
const MAXAIM = 35
export const CANCEL = 8
export const MAXPULL = 64
const DEAD = 0.15
export const FOCAL = F

export interface Params {
  k: number // the cup's pull
  sweeper: boolean
  turnstile: boolean
  showCurve: boolean
}

export const params = (g: GolfGreen): Params => ({
  k: g.well === 'off' ? 0 : g.well === 'strong' ? 1.8 : 1.1,
  sweeper: g.sweeper,
  turnstile: g.turnstile,
  showCurve: g.curve,
})

export interface Ball {
  x: number
  z: number
  vx: number
  vz: number
}

export type End = 'in' | 'duct' | 'stop'

export interface Game {
  t: number
  ball: Ball
  curve: number
  rollT: number
  ended: End | null
  lipped: boolean
  over: boolean
  sink: number
  inCup: boolean
  gone: boolean
}

export interface Pt {
  x: number
  y: number
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

export function proj(x: number, y: number, z: number) {
  const Y = y - CAMH
  const Z = z - CAMZ
  const d = -Y * SP + Z * CP
  const up = Y * CP + Z * SP
  return { x: CX + (F * x) / d, y: CY - (F * up) / d, d }
}

/** A screen point to where it lands on the floor, or on the back wall if the ray misses the floor. */
export function unproj(sx: number, sy: number) {
  const tt = (CY - sy) / F
  const xs = (sx - CX) / F
  const den = SP - tt * CP
  if (den > 0) {
    const Z = (CAMH * (tt * SP + CP)) / den
    const z = Z + CAMZ
    if (z <= BACK) return { x: xs * (CAMH * SP + Z * CP), z }
  }
  const Z = BACK - CAMZ
  const Y = (Z * (tt * CP - SP)) / (CP + tt * SP)
  return { x: xs * (-Y * SP + Z * CP), z: BACK }
}

/** One row of the floor, for drawing it a scanline at a time: where it is, or null above the horizon. */
export function floorRow(sy: number) {
  const tt = (CY - sy) / F
  const den = SP - tt * CP
  if (den <= 0) return null
  const Z = (CAMH * (tt * SP + CP)) / den
  return { z: Z + CAMZ, d: CAMH * SP + Z * CP }
}

export interface Drag extends Pt {
  sx: number
  sy: number
  aim: number
}

/** The press point and the drag: length past the cancel ring is power, the sideways share of the drag is curve. */
export function readPull(d: Drag, curveOn: boolean) {
  const dx = d.x - d.sx
  const dy = d.y - d.sy
  const dist = Math.hypot(dx, dy)
  if (dist < CANCEL) return { cancel: true, p: 0, curve: 0 }
  const p = clamp((dist - CANCEL) / (MAXPULL - CANCEL), 0, 1)
  let curve = 0
  if (curveOn) {
    const s = dx / dist
    const m = clamp((Math.abs(s) - DEAD) / 0.6, 0, 1)
    curve = Math.round(Math.sign(s) * m * 2 * 10) / 10
  }
  return { cancel: false, p, curve }
}

export function aimAt(p: Pt, b: Ball) {
  const w = unproj(p.x, p.y)
  const a = (Math.atan2(w.x - b.x, Math.max(0.05, w.z - b.z)) * 180) / Math.PI
  return Math.round(clamp(a, -MAXAIM, MAXAIM) * 10) / 10
}

export const freshGame = (t = 0): Game => ({
  t,
  ball: { x: 0, z: TEE, vx: 0, vz: 0 },
  curve: 0,
  rollT: 0,
  ended: null,
  lipped: false,
  over: false,
  sink: 0,
  inCup: false,
  gone: false,
})

export function strike(g: Game, aimDeg: number, p: number, curve: number) {
  const a = (aimDeg * Math.PI) / 180
  const v0 = 0.6 + p * 5.2
  g.ball.vx = v0 * Math.sin(a)
  g.ball.vz = v0 * Math.cos(a)
  g.curve = curve
  g.rollT = 0
}

export function sweeperAt(t: number) {
  const w = (2 * Math.PI) / SWP
  return { x: SWX * Math.sin(w * t), vx: SWX * w * Math.cos(w * t) }
}

function bounce(b: Ball, nx: number, nz: number, ux: number, uz: number, e: number) {
  let rx = b.vx - ux
  let rz = b.vz - uz
  const vn = rx * nx + rz * nz
  if (vn < 0) {
    rx -= (1 + e) * vn * nx
    rz -= (1 + e) * vn * nz
    b.vx = rx + ux
    b.vz = rz + uz
  }
}

/** One slice of the roll. Sets `ended` when the ball is done. */
export function step(g: Game, P: Params, h: number) {
  const b = g.ball
  g.rollT += h
  let dx = HOLE.x - b.x
  let dz = HOLE.z - b.z
  let r = Math.hypot(dx, dz)
  const inWell = P.k > 0 && r < WR
  if (inWell && r > 1e-4) {
    const a = P.k * (1 - r / WR)
    b.vx += ((a * dx) / r) * h
    b.vz += ((a * dz) / r) * h
  }
  let sp = Math.hypot(b.vx, b.vz)
  if (g.curve && sp > 0.02) {
    const a = g.curve * CURVEK * sp
    const px = b.vz / sp
    const pz = -b.vx / sp
    b.vx += a * px * h
    b.vz += a * pz * h
  }
  sp = Math.hypot(b.vx, b.vz)
  const mu = inWell ? MU * WELLMU : MU
  if (sp > 0) {
    const d = Math.min(sp, mu * h)
    b.vx -= (b.vx / sp) * d
    b.vz -= (b.vz / sp) * d
  }
  b.x += b.vx * h
  b.z += b.vz * h

  if (b.x - BR < -HALF) {
    b.x = -HALF + BR
    b.vx = Math.abs(b.vx) * 0.55
  }
  if (b.x + BR > HALF) {
    b.x = HALF - BR
    b.vx = -Math.abs(b.vx) * 0.55
  }
  if (b.z - BR < 0) {
    b.z = BR
    b.vz = Math.abs(b.vz) * 0.55
  }
  const inGap = b.x > DUCT[0] + BR && b.x < DUCT[1] - BR
  if (b.z + BR > BACK && !inGap) {
    b.z = BACK - BR
    b.vz = -Math.abs(b.vz) * 0.5
  }
  if (inGap && b.z > BACK + 0.12) {
    g.gone = true
    g.ended = 'duct'
    return
  }

  if (P.sweeper) {
    const s = sweeperAt(g.t)
    const qx = clamp(b.x, s.x - SWHX, s.x + SWHX)
    const qz = clamp(b.z, SWZ - SWHZ, SWZ + SWHZ)
    let nx = b.x - qx
    let nz = b.z - qz
    const d = Math.hypot(nx, nz)
    if (d < BR) {
      if (d < 1e-6) {
        nx = 0
        nz = -1
        b.x = qx
        b.z = SWZ - SWHZ - BR
      } else {
        nx /= d
        nz /= d
        b.x = qx + nx * BR
        b.z = qz + nz * BR
      }
      bounce(b, nx, nz, s.vx, 0, 0.6)
    }
  }
  if (P.turnstile) {
    const th = OMEGA * g.t
    const ux = Math.cos(th)
    const uz = Math.sin(th)
    const s = clamp((b.x - TP.x) * ux + (b.z - TP.z) * uz, -ARM, ARM)
    const qx = TP.x + s * ux
    const qz = TP.z + s * uz
    let nx = b.x - qx
    let nz = b.z - qz
    let d = Math.hypot(nx, nz)
    if (d < BR + BART && d > 1e-6) {
      nx /= d
      nz /= d
      b.x = qx + nx * (BR + BART)
      b.z = qz + nz * (BR + BART)
      bounce(b, nx, nz, -(qz - TP.z) * OMEGA, (qx - TP.x) * OMEGA, 0.5)
    }
    nx = b.x - TP.x
    nz = b.z - TP.z
    d = Math.hypot(nx, nz)
    if (d < BR + POST && d > 1e-6) {
      nx /= d
      nz /= d
      b.x = TP.x + nx * (BR + POST)
      b.z = TP.z + nz * (BR + POST)
      bounce(b, nx, nz, 0, 0, 0.5)
    }
  }

  dx = HOLE.x - b.x
  dz = HOLE.z - b.z
  r = Math.hypot(dx, dz)
  sp = Math.hypot(b.vx, b.vz)
  if (r < CUP - BR * 0.2) {
    if (sp < LIPV) {
      g.inCup = true
      g.sink = 1
      g.ended = 'in'
      return
    }
    if (!g.over) {
      g.over = true
      g.lipped = true
      const cross = b.vx * dz - b.vz * dx
      const ang = (cross > 0 ? -1 : 1) * 0.45 * (0.3 + r / CUP)
      const c = Math.cos(ang)
      const s2 = Math.sin(ang)
      const vx = b.vx * c - b.vz * s2
      const vz = b.vx * s2 + b.vz * c
      b.vx = vx * 0.8
      b.vz = vz * 0.8
    }
  } else if (r > CUP + BR) {
    g.over = false
  }

  sp = Math.hypot(b.vx, b.vz)
  const pull = inWell ? P.k * (1 - r / WR) : 0
  if ((sp < 0.02 && pull <= MU * WELLMU) || g.rollT > 25) {
    b.vx = 0
    b.vz = 0
    g.ended = 'stop'
  }
}

/** The roll, for one frame of `dt` seconds. */
export function advance(g: Game, P: Params, dt: number) {
  const h = 1 / 240
  let n = Math.min(14, Math.round(dt / h))
  while (n-- > 0 && !g.ended) {
    g.t += h
    step(g, P, h)
  }
  if (g.ended) g.t += Math.max(0, n) * h
}

/** What the screen says when the ball is done. */
export function outcome(g: Game) {
  if (g.ended === 'in') return { result: 'IN THE HOLE', detail: 'Hole in one.' }
  if (g.ended === 'duct') return { result: 'DOWN THE DUCT', detail: 'It rattles away into the vents.' }
  const r = Math.hypot(HOLE.x - g.ball.x, HOLE.z - g.ball.z)
  return { result: r < 0.35 ? 'SO CLOSE' : 'MISSED', detail: r.toFixed(1) + ' m from the cup' + (g.lipped ? ' · lipped out' : '') }
}

/** The first stretch of the roll, ignoring obstacles and the cup, for the preview dots: [x, z, how far along]. */
export function previewPath(b: Ball, aimDeg: number, p: number, curve: number) {
  const a = (aimDeg * Math.PI) / 180
  const v0 = 0.6 + p * 5.2
  const L = 0.6 + p * 3.4
  const h = 1 / 120
  let x = b.x
  let z = b.z
  let vx = v0 * Math.sin(a)
  let vz = v0 * Math.cos(a)
  let run = 0
  let next = 0.3
  const pts: [number, number, number][] = []
  for (let i = 0; i < 2400; i++) {
    let sp = Math.hypot(vx, vz)
    if (sp < 0.02) break
    if (curve) {
      const ac = curve * CURVEK * sp
      const px = vz / sp
      const pz = -vx / sp
      vx += ac * px * h
      vz += ac * pz * h
    }
    sp = Math.hypot(vx, vz)
    const d = Math.min(sp, MU * h)
    vx -= (vx / sp) * d
    vz -= (vz / sp) * d
    x += vx * h
    z += vz * h
    run += sp * h
    if (Math.abs(x) > HALF || z > BACK) break
    if (run >= next) {
      pts.push([x, z, run / L])
      next += 0.15
    }
    if (run > L) break
  }
  return pts
}
