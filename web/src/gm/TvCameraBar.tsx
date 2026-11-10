import { useEffect, useRef, useState } from 'react'
import { gmRun } from '../store/game'
import type { MapView, View } from '../types'
import { filmOn, useTick } from './StageSections'

/**
 * What the TV looks at, on the Scene tab: the whole crew, whoever rolls, one of the crew, or anyone else on this map.
 * The NPC rows in the column have their own camera button too.
 */
export function TvCameraBar({ view, map }: { view: View; map: MapView }) {
  const { camera, follow } = view.stage
  const busy = filmOn(view.stage) // the camera can't change under a film
  useTick(busy)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away, true) // capturing: the map keeps its own clicks to itself
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const shoot = (args: Record<string, unknown>) => void gmRun('gm.stage.camera', args)
  const here = Object.values(view.tokens)
    .filter((t) => t.map === map.id && t.kind === 'npc' && !t.hidden) // the TV can't follow what it isn't shown
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const followed = camera === 'follow' && follow ? view.tokens[follow] : undefined
  const npc = followed?.kind === 'npc' ? followed : undefined

  return (
    <div className="r10-mood r10-cam" role="group" aria-label="The TV's camera">
      <button type="button" className={camera === 'crew' ? 'on' : ''} aria-pressed={camera === 'crew'} disabled={busy} title="Keep the whole crew in frame" onClick={() => shoot({ camera: 'crew' })}>
        Crew
      </button>
      <button type="button" className={camera === 'roller' ? 'on' : ''} aria-pressed={camera === 'roller'} disabled={busy} title="Show the crew, cut to whoever rolls, then come back" onClick={() => shoot({ camera: 'roller' })}>
        Rolls
      </button>
      {view.crew.map((c) => {
        const on = camera === 'follow' && follow === c.id
        return (
          <button key={c.id} type="button" className={'r10-camface' + (on ? ' on' : '')} aria-pressed={on} aria-label={`Follow ${c.short}`} title={`Follow ${c.short}`} disabled={busy} onClick={() => shoot({ camera: 'follow', follow: c.id })}>
            <img src={c.portrait} alt="" className="r3-px" />
          </button>
        )
      })}
      <div ref={root} className="gx-sbcat">
        <button type="button" className={'r10-campick' + (npc || open ? ' on' : '')} aria-expanded={open} disabled={busy || here.length === 0} title="Follow someone else on this map" onClick={() => setOpen(!open)}>
          {npc ? npc.name : 'In this map'}
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        {open && (
          <div className="gx-sbmenu r10-cammenu" role="group" aria-label="Follow someone on this map">
            {here.map((t) => (
              <button
                key={t.id}
                type="button"
                className={npc?.id === t.id ? 'on' : ''}
                aria-pressed={npc?.id === t.id}
                onClick={() => {
                  shoot({ camera: 'follow', follow: t.id })
                  setOpen(false)
                }}
              >
                <img src={t.portrait} alt="" className="r3-px" />
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
