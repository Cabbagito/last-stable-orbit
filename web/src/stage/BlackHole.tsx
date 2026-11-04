import { useEffect, useRef } from 'react'

// What a player's laptop shows while a film plays on the TV (Round 13, board R13FilmDust, Peter's pick): black,
// a few faint stars, and a small pixel black hole with dust falling in. Grains spiral inward, pink on the side
// turning away and cyan on the side turning toward you, going white-hot near the hole and dimming out at its
// edge. Something to glance at, not to watch. No text.

const PX = 5 // CSS px per art pixel
const R_CSS = 27 // the hole's radius in CSS px
const TAU = Math.PI * 2
const PINK = [1, 0.31, 0.64]
const CYAN = [0.62, 0.95, 1]
const LILAC = [0.77, 0.69, 1]
const WHITE = [1, 0.96, 0.92]
type Rgb = number[]

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
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

interface Grain {
  r: number
  a: number
  k: number
  age: number
}

class Dust {
  W: number
  H: number
  cx: number
  cy: number
  R = R_CSS / PX
  tilt = (-12 * Math.PI) / 180
  inc = 0.42
  C: number
  rnd = rng(29)
  dust: Grain[] = []
  stars: { x: number; y: number; k: number; ph: number; f: number }[] = []
  r: Float32Array
  g: Float32Array
  b: Float32Array
  img: ImageData
  last: number | null = null

  constructor(
    private ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ) {
    this.W = W
    this.H = H
    this.cx = Math.round(W / 2)
    this.cy = Math.round(H / 2)
    const R = this.R
    this.C = 0.55 * R * R // how fast grains fall: dr/dt = -C / r
    this.r = new Float32Array(W * H)
    this.g = new Float32Array(W * H)
    this.b = new Float32Array(W * H)
    this.img = ctx.createImageData(W, H)
    const n = Math.round(300 * (3 / PX) * (3 / PX))
    for (let i = 0; i < n; i++) {
      // spread evenly over the disc's area, as a steady fall leaves it
      this.dust.push({ r: R * Math.sqrt(1.44 + this.rnd() * (64 - 1.44)), a: this.rnd() * TAU, k: 0.5 + 0.5 * this.rnd(), age: 99 })
    }
    const want = Math.round((46 * W * H) / (288 * 180)) // the board's density, on any screen
    for (let tries = 0; this.stars.length < want && tries < want * 20; tries++) {
      const x = Math.floor(this.rnd() * W)
      const y = Math.floor(this.rnd() * H)
      if (Math.hypot(x - this.cx, y - this.cy) < R * 10) continue
      this.stars.push({ x, y, k: 0.04 + 0.1 * this.rnd() * this.rnd(), ph: this.rnd() * TAU, f: 0.3 + 0.5 * this.rnd() })
    }
  }

  at(x: number, y: number): [number, number] {
    const c = Math.cos(this.tilt)
    const s = Math.sin(this.tilt)
    return [this.cx + x * c - y * s, this.cy + x * s + y * c]
  }

  add(p: [number, number], col: Rgb, k: number) {
    const x = Math.round(p[0])
    const y = Math.round(p[1])
    if (x < 0 || y < 0 || x >= this.W || y >= this.H || !(k > 0)) return
    const i = y * this.W + x
    this.r[i] += col[0] * k
    this.g[i] += col[1] * k
    this.b[i] += col[2] * k
  }

  // the shadow: nothing behind it gets through
  shade() {
    const { R, cx, cy, W, H } = this
    for (let y = Math.floor(cy - R) - 1; y <= cy + R + 1; y++) {
      for (let x = Math.floor(cx - R) - 1; x <= cx + R + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < R * R) {
          const i = y * W + x
          this.r[i] = this.g[i] = this.b[i] = 0
        }
      }
    }
  }

  show() {
    const d = this.img.data
    const n = this.W * this.H
    const G = 0.8
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = this.r[i]
      const g = this.g[i]
      const b = this.b[i]
      if (r + g + b === 0) {
        d[j] = d[j + 1] = d[j + 2] = 0
      } else {
        d[j] = 255 * G * (1 - Math.exp(-2 * r))
        d[j + 1] = 255 * G * (1 - Math.exp(-2 * g))
        d[j + 2] = 255 * G * (1 - Math.exp(-2 * b))
      }
      d[j + 3] = 255
    }
    this.ctx.putImageData(this.img, 0, 0)
    this.r.fill(0)
    this.g.fill(0)
    this.b.fill(0)
  }

  spin(r: number) {
    return 0.32 * Math.pow((2 * this.R) / r, 1.5) // radians a second
  }

  // brighter as it falls, then dimming right at the edge
  glow(r: number) {
    const R = this.R
    return 0.2 * Math.pow((2.2 * R) / r, 1.1) * Math.sqrt(Math.max(0, 1 - (1.05 * R) / r))
  }

  // pink turning away, cyan turning toward you, white-hot near the hole, a little lilac far out
  hue(r: number, c: number): Rgb {
    const f = Math.min(1, Math.max(0, (r / this.R - 1) / 6))
    const side = mix(PINK, CYAN, (c + 1) / 2)
    return f < 0.25 ? mix(WHITE, side, f / 0.25) : mix(side, LILAC, (f - 0.25) * 0.35)
  }

  // each grain with a short tail along the path it came by: long near the hole, where it's fast
  grains(front: boolean) {
    for (const q of this.dust) {
      const fade = Math.min(1, q.age / 3)
      for (let j = 0; j < 6; j++) {
        const back = j * 0.32
        const r = Math.sqrt(q.r * q.r + 2 * this.C * back)
        const a = q.a - this.spin(r) * back
        const c = Math.cos(a)
        const s = Math.sin(a)
        if (s > 0 !== front) continue
        const dop = 1 + 0.4 * c // the side coming toward you is brighter
        this.add(this.at(r * c, r * s * this.inc), this.hue(r, c), this.glow(r) * dop * dop * fade * q.k * (1 - j / 6))
      }
    }
  }

  paint(t: number) {
    const R = this.R
    const dt = this.last == null ? 0 : Math.min(0.1, Math.max(0, t - this.last))
    this.last = t
    for (const q of this.dust) {
      q.r -= (this.C / q.r) * dt
      q.a += this.spin(q.r) * dt
      q.age += dt
      if (q.r < R * 1.05) {
        q.r = R * (7.6 + 0.4 * this.rnd())
        q.a = this.rnd() * TAU
        q.age = 0
      }
    }
    for (const s of this.stars) this.add([s.x, s.y], LILAC, s.k * (0.75 + 0.25 * Math.sin(t * s.f + s.ph)))
    this.grains(false)
    this.shade()
    const m = Math.ceil(TAU * (R + 0.6) * 2.5)
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU
      this.add([this.cx + (R + 0.6) * Math.cos(a), this.cy + (R + 0.6) * Math.sin(a)], LILAC, 0.06)
    }
    this.grains(true)
    this.show()
  }
}

export function BlackHole() {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = cv.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let dust: Dust | null = null
    const fit = () => {
      const W = Math.ceil(c.clientWidth / PX)
      const H = Math.ceil(c.clientHeight / PX)
      if (!W || !H) return
      c.width = W
      c.height = H
      dust = new Dust(ctx, W, H)
      if (still) dust.paint(0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    const t0 = performance.now()
    let last = -1
    let raf = 0
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const t = (now - t0) / 1000
      if (still || !dust || t - last < 1 / 30) return
      last = t
      dust.paint(t)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  return <canvas ref={cv} aria-hidden="true" className="app-hole" />
}
