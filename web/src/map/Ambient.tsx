import type { CSSProperties } from 'react'
import type { AmbientDef, MapView } from '../types'

/**
 * What moves by itself on a map (the UI review canvas, "Round 2: ambient map"): lights that breathe, stutter or
 * blink, steam, and dust in the air. Each is placed by hand in the map's YAML (`ambient:`), in display px, and drawn
 * over the art and under the tokens. The motion is all CSS (amb- in app.css) and stops for reduced motion.
 */
export function Ambient({ map }: { map: MapView }) {
  const on = (map.ambient ?? []).filter((a) => !a.moods.length || a.moods.includes(map.mood))
  if (!on.length) return null
  return (
    <div className="amb" aria-hidden="true">
      {on.map((a, i) => (a.kind === 'glow' ? <Glows key={i} a={a} seed={seedOf(map.id, i)} /> : a.kind === 'steam' ? <Steam key={i} a={a} /> : <Dust key={i} a={a} seed={seedOf(map.id, i)} />))}
    </div>
  )
}

/** A small repeatable random stream, so a map's specks and twinkles are the same on every screen. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
const seedOf = (id: string, i: number) => [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7 + i * 101)

function Glows({ a, seed }: { a: AmbientDef; seed: number }) {
  const r = rng(seed)
  const pts = a.points.length ? a.points : a.at ? [a.at] : []
  const [w, h] = a.size
  const paint =
    a.blend === 'tint'
      ? `radial-gradient(closest-side, rgba(${a.color},.85), rgba(${a.color},.35) 60%, rgba(${a.color},0))`
      : `radial-gradient(closest-side, rgba(${a.color},.9), rgba(${a.color},.3) 55%, rgba(${a.color},0))`
  return (
    <>
      {pts.map(([x, y], k) => (
        <span
          key={k}
          className={`amb-g amb-${a.beat === 'screen' ? 'b-screen' : a.beat}` + (a.blend === 'tint' ? '' : ' amb-screen')}
          style={{ left: x - w / 2, top: y - h / 2, width: w, height: h, background: paint, animationDelay: `${a.beat === 'twinkle' && !a.step ? -(r() * 4).toFixed(2) : (k * a.step).toFixed(2)}s` }}
        />
      ))}
    </>
  )
}

const PUFFS: [number, number, number][] = [
  [-36, -36, 0],
  [-8, -20, -1.5],
  [-52, -28, -3],
  [-20, -44, -4.5],
]

function Steam({ a }: { a: AmbientDef }) {
  const [x, y] = a.at ?? [0, 0]
  return (
    <>
      {PUFFS.map(([dx, dy, d], k) => (
        <span key={k} className="amb-puff" style={{ left: x + dx, top: y + dy, animationDelay: `${d}s` }} />
      ))}
    </>
  )
}

function Dust({ a, seed }: { a: AmbientDef; seed: number }) {
  if (!a.box) return null
  const r = rng(seed)
  const [x0, y0, x1, y1] = a.box
  return (
    <>
      {Array.from({ length: a.count }, (_, k) => {
        const s = r() < 0.4 ? 4 : 6
        const style: CSSProperties = { left: x0 + r() * (x1 - x0), top: y0 + r() * (y1 - y0), width: s, height: s, background: `rgba(${a.color},.95)`, animationDuration: `${12 + Math.floor(r() * 11)}s`, animationDelay: `${-Math.floor(r() * 22)}s` }
        return <span key={k} className="amb-mote" style={style} />
      })}
    </>
  )
}
