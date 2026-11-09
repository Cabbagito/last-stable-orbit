import { useEffect, useRef, useState } from 'react'
import { gmRun, useGame } from '../store/game'

/**
 * The GM's soundboard, on the top bar: one button per category, each opening its sounds. A menu stays open for the
 * next press, until you click away or press Esc. The sounds play on the TV, so with no TV connected it's greyed out.
 */
export function Soundboard() {
  const board = useGame((s) => s.view?.stage.soundboard) // only the GM's own feed has it
  const tv = useGame((s) => !!s.view?.stage.tv)
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('pointerdown', away, true) // capturing: the map keeps its own clicks to itself
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (!board?.length) return null
  return (
    <div ref={root} className="gx-sb" role="group" aria-label="Soundboard">
      {board.map((c) => {
        const on = tv && open === c.id
        return (
          <div key={c.id} className="gx-sbcat">
            <button
              type="button"
              className={'gx-sbbtn' + (on ? ' on' : '')}
              aria-expanded={on}
              disabled={!tv}
              title={tv ? `${c.name} sounds, on the TV` : 'Connect the TV to play sounds'}
              onClick={() => setOpen(on ? null : c.id)}
              onPointerEnter={() => open && setOpen(c.id)} // once one is open, moving along the bar opens the next, like any menu bar
            >
              {c.name}
            </button>
            {on && (
              <div className="gx-sbmenu" role="group" aria-label={`${c.name} sounds`}>
                {c.sounds.map((s) => (
                  <button key={s.id} type="button" onClick={() => void gmRun('gm.sound.play', { sound: s.id })}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
