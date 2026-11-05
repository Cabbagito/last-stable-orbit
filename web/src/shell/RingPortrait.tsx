import type { CSSProperties } from 'react'
import type { Ring } from '../lib/ring'

/** A circular portrait chip inside its ring (R6's sheet portrait, token head and crew rail). */
export function RingPortrait({ src, ring, size, style }: { src: string; ring: Ring; size: number; style?: CSSProperties }) {
  return (
    <span style={{ position: 'relative', display: 'block', width: size, height: size, flex: 'none', ...style }}>
      <img
        src={src}
        alt=""
        draggable={false}
        className="r3-px"
        style={{
          position: 'absolute',
          left: `${ring.p}%`,
          top: `${ring.p}%`,
          width: `${ring.d}%`,
          height: `${ring.d}%`,
          borderRadius: '50%',
          background: '#000',
          pointerEvents: 'none',
        }}
      />
      <svg className="app-ring" viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
        {ring.arcs.map((a, i) => (
          <path key={i} d={a.d} fill="none" stroke={a.c} strokeWidth={a.w} strokeLinecap={a.cap} opacity={a.o} />
        ))}
      </svg>
    </span>
  )
}
