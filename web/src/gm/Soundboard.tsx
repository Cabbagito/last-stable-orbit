import { useEffect, useRef, useState } from 'react'
import { gmRun, useGame } from '../store/game'
import { digitLabel, useKeyHandler, useKeys } from '../keys/registry'

/**
 * The GM's soundboard, on the top bar: one button per category, each opening its sounds. A menu stays open for the
 * next press, until you click away or press Esc. The sounds play on the TV, so with no TV connected it's greyed out.
 * From the keyboard: B, then the category's digit, then the sound's. Each sound shows its two digits.
 */
export function Soundboard() {
  const board = useGame((s) => s.view?.stage.soundboard) // only the GM's own feed has it
  const tv = useGame((s) => !!s.view?.stage.tv)
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const chord = useKeys((s) => s.chord)
  const keyedOpen = useRef(false) // the menu was opened by a digit, so it closes when B is done

  useKeyHandler('sound.ready', () => tv && !!board?.length)
  useKeyHandler('sound.cat', (i) => {
    const c = board?.[i]
    if (!tv || !c) return false
    keyedOpen.current = true
    setOpen(c.id)
  })
  useKeyHandler('sound.play', (i) => {
    const c = board?.[useKeys.getState().soundCat ?? -1]
    const snd = c?.sounds[i]
    if (!tv || !snd) return false
    void gmRun('gm.sound.play', { sound: snd.id })
  })
  useEffect(() => {
    if (!chord && keyedOpen.current) {
      keyedOpen.current = false
      setOpen(null)
    }
  }, [chord])

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
    <div ref={root} className={'gx-sb' + (tv && (chord === 'sound' || chord === 'soundCat') ? ' keyed' : '')} role="group" aria-label="Soundboard">
      {board.map((c, ci) => {
        const on = tv && open === c.id
        return (
          <div key={c.id} className="gx-sbcat">
            <button
              type="button"
              className={'gx-sbbtn' + (on ? ' on' : '')}
              aria-expanded={on}
              disabled={!tv}
              title={tv ? `${c.name} sounds, on the TV${ci < 10 ? ` (B ${digitLabel(ci)})` : ''}` : 'Connect the TV to play sounds'}
              onClick={() => setOpen(on ? null : c.id)}
              onPointerEnter={() => open && setOpen(c.id)} // once one is open, moving along the bar opens the next, like any menu bar
            >
              {c.name}
            </button>
            {on && (
              <div className="gx-sbmenu" role="group" aria-label={`${c.name} sounds`}>
                {c.sounds.map((s, si) => (
                  <button key={s.id} type="button" onClick={() => void gmRun('gm.sound.play', { sound: s.id })}>
                    {s.name}
                    {ci < 10 && si < 10 && (
                      <span className="gx-sbcode" aria-label={`B ${digitLabel(ci)} ${digitLabel(si)}`}>
                        {digitLabel(ci)} {digitLabel(si)}
                      </span>
                    )}
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
