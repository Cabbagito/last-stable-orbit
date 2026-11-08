// Painting the green, as the Mini-golf canvas paints it: the room in 384 x 216 pixels, the controls on a sharper layer.
import {
  ARM, BACK, BR, CANCEL, CUP, CX, CY, DUCT, FOCAL as F, H, HALF, HOLE, K, LWALL, MAXPULL, OMEGA, RWALL, SWH, SWHX, SWHZ, SWZ, TP, W, WALLH, WR,
  aimAt, clamp, floorRow, previewPath, proj, readPull, sweeperAt, type Drag, type Game, type Params, type Pt,
} from './golf'

type C = CanvasRenderingContext2D
type V3 = [number, number, number]

const stars = (() => {
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  return Array.from({ length: 40 }, () => ({ x: 0.1 + rnd() * 1.4, y: 0.82 + rnd() * 1.36, b: 0.3 + rnd() * 0.7 }))
})()

const shade = (c: V3, k: number) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`

function quad(c: C, pts: V3[], fill: string) {
  c.beginPath()
  pts.forEach((v, i) => {
    const p = proj(v[0], v[1], v[2])
    if (i === 0) c.moveTo(p.x, p.y)
    else c.lineTo(p.x, p.y)
  })
  c.closePath()
  c.fillStyle = fill
  c.fill()
}

function line3(c: C, a: V3, b: V3, stroke: string) {
  const p = proj(a[0], a[1], a[2])
  const q = proj(b[0], b[1], b[2])
  c.beginPath()
  c.moveTo(p.x, p.y)
  c.lineTo(q.x, q.y)
  c.strokeStyle = stroke
  c.lineWidth = 1
  c.stroke()
}

export function drawGreen(c: C, g: Game, P: Params) {
  const t = g.t
  c.imageSmoothingEnabled = false
  c.fillStyle = '#04040a'
  c.fillRect(0, 0, W, H)

  // far wall, window to the hole, duct hatch
  quad(c, [[LWALL, 0, BACK], [RWALL, 0, BACK], [RWALL, WALLH, BACK], [LWALL, WALLH, BACK]], '#131828')
  quad(c, [[0.1, 0.8, BACK], [1.5, 0.8, BACK], [1.5, 2.2, BACK], [0.1, 2.2, BACK]], '#020207')
  for (const s of stars) {
    const p = proj(s.x, s.y, BACK)
    const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + s.x * 40)
    c.fillStyle = `rgba(220,214,255,${(s.b * tw).toFixed(2)})`
    c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
  }
  const bh = proj(0.8, 1.5, BACK)
  const sc = F / bh.d
  c.save()
  c.translate(bh.x, bh.y)
  c.rotate(-0.18)
  c.beginPath()
  c.ellipse(0, 0, 0.42 * sc, 0.09 * sc, 0, 0, Math.PI * 2)
  c.strokeStyle = 'rgba(255,182,72,0.85)'
  c.lineWidth = 2
  c.stroke()
  c.beginPath()
  c.arc(0, 0, 0.15 * sc, 0, Math.PI * 2)
  c.strokeStyle = 'rgba(255,125,187,0.9)'
  c.lineWidth = 1
  c.stroke()
  c.beginPath()
  c.arc(0, 0, 0.13 * sc, 0, Math.PI * 2)
  c.fillStyle = '#000000'
  c.fill()
  c.beginPath()
  c.ellipse(0, 0, 0.42 * sc, 0.09 * sc, 0, 0, Math.PI)
  c.strokeStyle = 'rgba(255,182,72,0.95)'
  c.lineWidth = 2
  c.stroke()
  c.restore()
  quad(c, [[DUCT[0], 0, BACK], [DUCT[1], 0, BACK], [DUCT[1], 0.42, BACK], [DUCT[0], 0.42, BACK]], '#05060a')
  for (let y = 0.07; y < 0.42; y += 0.07) line3(c, [DUCT[0] + 0.03, y, BACK], [DUCT[1] - 0.03, y, BACK], '#1f2433')
  line3(c, [LWALL, 2.5, BACK], [RWALL, 2.5, BACK], 'rgba(255,79,163,0.9)')

  // side walls: the hull on the left, the founder's office glass on the right
  quad(c, [[LWALL, 0, 0], [LWALL, 0, BACK], [LWALL, WALLH, BACK], [LWALL, WALLH, 0]], '#0d101a')
  quad(c, [[RWALL, 0, 0], [RWALL, 0, BACK], [RWALL, WALLH, BACK], [RWALL, WALLH, 0]], '#141a30')
  quad(c, [[RWALL, 0.7, 2.4], [RWALL, 0.7, 6.8], [RWALL, 1.9, 6.8], [RWALL, 1.9, 2.4]], 'rgba(184,168,255,0.10)')
  const glow = 0.25 + 0.08 * Math.sin(t * 0.9)
  quad(c, [[RWALL, 0.95, 5.4], [RWALL, 0.95, 5.8], [RWALL, 1.2, 5.8], [RWALL, 1.2, 5.4]], `rgba(255,214,150,${glow.toFixed(2)})`)
  for (let z = 1.2; z < BACK; z += 1.4) line3(c, [RWALL, 0, z], [RWALL, WALLH, z], '#2a3150')
  line3(c, [LWALL, 2.5, 0.2], [LWALL, 2.5, BACK], 'rgba(255,79,163,0.55)')
  line3(c, [RWALL, 2.5, 0.2], [RWALL, 2.5, BACK], 'rgba(255,79,163,0.55)')

  // floor and green, one scanline at a time
  const y0 = Math.max(0, Math.ceil(proj(0, 0, BACK).y))
  for (let sy = y0; sy < H; sy++) {
    const row = floorRow(sy + 0.5)
    if (!row || row.z > BACK) continue
    const { z, d } = row
    const k = clamp(1.25 - d * 0.06, 0.3, 1)
    const fl = CX + (F * LWALL) / d
    const fr = CX + (F * RWALL) / d
    c.fillStyle = shade(Math.floor(z / 0.6) % 2 ? [16, 18, 27] : [13, 15, 23], k)
    c.fillRect(Math.floor(fl), sy, Math.ceil(fr - fl), 1)
    const gl = CX + (F * -HALF) / d
    const gr = CX + (F * HALF) / d
    c.fillStyle = shade(Math.floor(z / 0.55) % 2 ? [40, 108, 68] : [34, 96, 60], k)
    c.fillRect(Math.floor(gl), sy, Math.ceil(gr - gl), 1)
    if (P.k > 0 && Math.abs(z - HOLE.z) < WR) {
      const xa = CX + (F * (HOLE.x - WR)) / d
      const xb = CX + (F * (HOLE.x + WR)) / d
      for (let sx = Math.floor(xa); sx <= Math.ceil(xb); sx++) {
        const x = ((sx + 0.5 - CX) * d) / F
        const rr = Math.hypot(x - HOLE.x, z - HOLE.z)
        if (rr < WR) {
          const q = 1 - rr / WR
          c.fillStyle = `rgba(0,0,0,${(0.42 * q * q).toFixed(3)})`
          c.fillRect(sx, sy, 1, 1)
        }
      }
    }
  }

  // rails, with the gap at the duct
  line3(c, [-HALF, 0.05, 0.2], [-HALF, 0.05, BACK], '#4a5578')
  line3(c, [HALF, 0.05, 0.2], [HALF, 0.05, BACK], '#4a5578')
  line3(c, [-HALF, 0.05, BACK], [DUCT[0], 0.05, BACK], '#4a5578')
  line3(c, [DUCT[1], 0.05, BACK], [HALF, 0.05, BACK], '#4a5578')

  // the cup
  const hc = proj(HOLE.x, 0, HOLE.z)
  const rx = (F * CUP) / hc.d
  const ry = Math.max(1, (proj(HOLE.x, 0, HOLE.z - CUP).y - proj(HOLE.x, 0, HOLE.z + CUP).y) / 2)
  if (P.k > 0) {
    const a = 0.45 + 0.2 * Math.sin(t * 2.2)
    c.beginPath()
    c.ellipse(hc.x, hc.y, rx * 1.7, ry * 1.7, 0, 0, Math.PI * 2)
    c.strokeStyle = `rgba(255,182,72,${a.toFixed(2)})`
    c.lineWidth = 1
    c.stroke()
  }
  c.beginPath()
  c.ellipse(hc.x, hc.y, rx, ry, 0, 0, Math.PI * 2)
  c.fillStyle = '#010103'
  c.fill()
  if (g.sink > 0) {
    const e = 1 - g.sink
    c.beginPath()
    c.ellipse(hc.x, hc.y, rx * (1.5 + e * 5), ry * (1.5 + e * 5), 0, 0, Math.PI * 2)
    c.strokeStyle = `rgba(255,79,163,${g.sink.toFixed(2)})`
    c.lineWidth = 1
    c.stroke()
  }

  // moving things and the ball, far to near
  const items: { z: number; f: () => void }[] = []
  if (P.turnstile) items.push({ z: TP.z, f: () => drawTurnstile(c, t) })
  if (P.sweeper) items.push({ z: SWZ, f: () => drawSweeper(c, t) })
  if (!g.inCup && !g.gone) items.push({ z: g.ball.z, f: () => drawBall(c, g) })
  items.sort((a, b) => b.z - a.z)
  for (const it of items) it.f()

  // soft vignette
  const vg = c.createRadialGradient(CX, CY + 20, 60, CX, CY + 20, 240)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.55)')
  c.fillStyle = vg
  c.fillRect(0, 0, W, H)
}

function drawBall(c: C, g: Game) {
  const b = g.ball
  const p = proj(b.x, 0, b.z)
  const r = Math.max(1.2, (F * BR) / p.d)
  c.beginPath()
  c.ellipse(p.x + r * 0.3, p.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2)
  c.fillStyle = 'rgba(0,0,0,0.45)'
  c.fill()
  c.beginPath()
  c.arc(p.x, p.y - r, r, 0, Math.PI * 2)
  c.fillStyle = '#f4f1ea'
  c.fill()
  if (r > 2) {
    c.fillStyle = '#ffffff'
    c.fillRect(Math.round(p.x - r * 0.4), Math.round(p.y - r * 1.5), 1, 1)
  }
}

function drawSweeper(c: C, t: number) {
  const x = sweeperAt(t).x
  const zf = SWZ - SWHZ
  const zb = SWZ + SWHZ
  quad(c, [[x - SWHX, SWH, zf], [x + SWHX, SWH, zf], [x + SWHX, SWH, zb], [x - SWHX, SWH, zb]], '#7d8392')
  quad(c, [[x - SWHX, 0.03, zf], [x + SWHX, 0.03, zf], [x + SWHX, SWH, zf], [x - SWHX, SWH, zf]], '#b6bac6')
  quad(c, [[x - SWHX + 0.03, 0.14, zf - 0.001], [x + SWHX - 0.03, 0.14, zf - 0.001], [x + SWHX - 0.03, 0.19, zf - 0.001], [x - SWHX + 0.03, 0.19, zf - 0.001]], '#1a1d26')
  const scan = (Math.sin(t * 3) + 1) / 2
  const ex = x - SWHX + 0.05 + scan * (2 * SWHX - 0.14)
  quad(c, [[ex, 0.15, zf - 0.002], [ex + 0.05, 0.15, zf - 0.002], [ex + 0.05, 0.18, zf - 0.002], [ex, 0.18, zf - 0.002]], '#ffb648')
  quad(c, [[x - SWHX, 0, zf - 0.01], [x + SWHX, 0, zf - 0.01], [x + SWHX, 0.03, zf - 0.01], [x - SWHX, 0.03, zf - 0.01]], '#ff4fa3')
}

function drawTurnstile(c: C, t: number) {
  const th = OMEGA * t
  const ux = Math.cos(th) * ARM
  const uz = Math.sin(th) * ARM
  const a = [TP.x - ux, TP.z - uz]
  const b = [TP.x + ux, TP.z + uz]
  quad(c, [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 0.16, b[1]], [a[0], 0.16, a[1]]], '#8d93a2')
  line3(c, [a[0], 0.16, a[1]], [b[0], 0.16, b[1]], '#d7dbe4')
  quad(c, [[TP.x - 0.045, 0, TP.z], [TP.x + 0.045, 0, TP.z], [TP.x + 0.045, 0.34, TP.z], [TP.x - 0.045, 0.34, TP.z]], '#5c6272')
  const p = proj(TP.x, 0.36, TP.z)
  c.fillStyle = Math.sin(t * 4) > 0 ? '#ff4fa3' : '#5a1d3c'
  c.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2)
}

/** The aiming marks and the power bar, drawn sharp on their own canvas so they track the mouse exactly. */
export function drawControls(c: C, g: Game, P: Params, phase: string, hover: Pt | null, d: Drag | null) {
  c.clearRect(0, 0, c.canvas.width, c.canvas.height)
  if (phase !== 'aim' && phase !== 'drag') return

  const cross = (x: number, y: number, r: number, col: string, w: number) => {
    c.strokeStyle = col
    c.lineWidth = w
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.stroke()
    c.beginPath()
    c.moveTo(x - r - 8, y)
    c.lineTo(x - r + 6, y)
    c.moveTo(x + r - 6, y)
    c.lineTo(x + r + 8, y)
    c.moveTo(x, y - r - 8)
    c.lineTo(x, y - r + 6)
    c.moveTo(x, y + r - 6)
    c.lineTo(x, y + r + 8)
    c.stroke()
  }
  const dots = (pts: [number, number, number][], base: number) => {
    for (const q of pts) {
      const p = proj(q[0], 0.01, q[1])
      c.fillStyle = `rgba(255,125,187,${(base * (1 - q[2] * 0.75)).toFixed(2)})`
      c.beginPath()
      c.arc(p.x * K, p.y * K, 4, 0, Math.PI * 2)
      c.fill()
    }
  }

  if (phase === 'aim') {
    const bp = proj(g.ball.x, 0, g.ball.z)
    const r0 = ((F * BR) / bp.d) * K
    const pulse = (Math.sin(g.t * 3) + 1) / 2
    c.strokeStyle = `rgba(255,125,187,${(0.3 + 0.4 * pulse).toFixed(2)})`
    c.lineWidth = 3
    c.beginPath()
    c.arc(bp.x * K, bp.y * K - r0, r0 + 14 + pulse * 6, 0, Math.PI * 2)
    c.stroke()
    if (hover) {
      dots(previewPath(g.ball, aimAt(hover, g.ball), 0.55, 0), 0.45)
      cross(hover.x * K, hover.y * K, 14, 'rgba(231,233,236,0.55)', 2)
    }
    return
  }

  if (!d) return
  const pr = readPull(d, P.showCurve)
  const sx = d.sx * K
  const sy = d.sy * K
  if (!pr.cancel) dots(previewPath(g.ball, d.aim, pr.p, pr.curve), 1)
  cross(sx, sy, 16, '#ff7dbb', 3)

  c.strokeStyle = pr.cancel ? '#e7e9ec' : 'rgba(231,233,236,0.35)'
  c.lineWidth = 2
  c.setLineDash([6, 6])
  c.beginPath()
  c.arc(sx, sy, CANCEL * K, 0, Math.PI * 2)
  c.stroke()
  c.setLineDash([])

  const dx = d.x - d.sx
  const dy = d.y - d.sy
  const dist = Math.hypot(dx, dy)
  const m = dist > MAXPULL ? MAXPULL / dist : 1
  const ex = (d.sx + dx * m) * K
  const ey = (d.sy + dy * m) * K
  c.strokeStyle = pr.cancel ? 'rgba(231,233,236,0.6)' : '#ff4fa3'
  c.lineWidth = 3
  c.beginPath()
  c.moveTo(sx, sy)
  c.lineTo(ex, ey)
  c.stroke()
  c.fillStyle = '#ffffff'
  c.beginPath()
  c.arc(ex, ey, 6, 0, Math.PI * 2)
  c.fill()

  const bx = 2160
  const by = 264
  const bw = 54
  const bh = 768
  c.fillStyle = 'rgba(0,0,0,0.6)'
  c.fillRect(bx - 10, by - 10, bw + 20, bh + 20)
  c.strokeStyle = '#e7e9ec'
  c.lineWidth = 3
  c.strokeRect(bx, by, bw, bh)
  const fh = (bh - 18) * pr.p
  c.fillStyle = '#ff4fa3'
  c.fillRect(bx + 9, by + bh - 9 - fh, bw - 18, fh)
  c.fillStyle = '#5e626a'
  for (let q = 1; q < 4; q++) c.fillRect(bx - 18, by + (bh * q) / 4 - 1.5, 12, 3)
}
