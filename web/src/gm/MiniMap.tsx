import { useLayoutEffect, useRef, useState } from 'react'
import { proj } from '../lib/proj'
import { MapLayers } from '../map/MapLayers'
import type { MapView, TokenView } from '../types'

/**
 * A map as it is right now, small and read-only, for the GM tab: its mood, its switches (gas, the hatch, the
 * feed), its decals, the camera cones while they're shown, and everyone standing on it. Hidden tokens are faint.
 */
export function MiniMap({ map, tokens, onOpen }: { map: MapView; tokens: TokenView[]; onOpen?: () => void }) {
  const box = useRef<HTMLButtonElement>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [W, H] = map.display
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [w, h] = size
  const zoom = w && h ? Math.min(w / W, h / H) : 0
  const tok = zoom ? Math.min(0.5 / zoom, 6) : 1 // tokens stay about 32 px across, however small the map is drawn
  const mood = map.moods.find((m) => m.id === map.mood)
  return (
    <button
      ref={box}
      type="button"
      className="app-mini"
      style={{ height: 280 }}
      onClick={onOpen}
      aria-label={`${map.name}, ${mood?.label ?? ''}. Open it on the Scene`}
      title="Open it on the Scene"
    >
      {zoom > 0 && (
        <div
          className="app-world"
          style={{ width: W, height: H, transform: `translate(${(w - W * zoom) / 2}px, ${(h - H * zoom) / 2}px) scale(${zoom})` }}
          aria-hidden="true"
        >
          <MapLayers map={map} />
          {tokens.map((t) => {
            const [x, y] = proj(map.origin, t.at)
            return (
              <span
                key={t.id}
                className={'app-minitok' + (t.hidden ? ' off' : '')}
                style={{ left: x, top: y, zIndex: Math.round(y), transform: `scale(${tok * (t.size ?? 1)})`, boxShadow: `0 0 0 4px ${t.color}` }}
              >
                <img src={t.portrait} alt="" className="r3-px" draggable={false} />
              </span>
            )
          })}
        </div>
      )}
    </button>
  )
}
