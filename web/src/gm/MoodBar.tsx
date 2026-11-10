import { gmRun, useGame } from '../store/game'
import type { MapView, SwitchDef } from '../types'

/** The switches that apply in the map's current mood. */
export const liveSwitches = (map: MapView) =>
  map.switches.filter((s) => !s.moods.length || s.moods.includes(map.mood))

/** "Gas 2/3", "Hatch: on". A level switch steps up one each press and wraps to 0. */
export function switchLabel(s: SwitchDef, v: number) {
  return s.type === 'level' ? `${s.label} ${v}/${s.max}` : `${s.label}: ${v ? 'on' : 'off'}`
}

export function pressSwitch(map: MapView, s: SwitchDef) {
  const v = map.values[s.id] ?? 0
  const next = s.type === 'level' ? (v + 1) % (s.max + 1) : v ? 0 : 1
  return gmRun('gm.map.switch', { map: map.id, switch: s.id, value: next })
}

/**
 * Round 12: the map's mood and its switches, sitting just above the map's name. GM only. A map with one mood has
 * nothing to pick. "What's where" shows or hides the Key board's pins, on this screen only.
 */
export function MoodBar({ map }: { map: MapView }) {
  const pins = useGame((s) => s.pins)
  const setPins = useGame((s) => s.setPins)
  return (
    <div className="r10-mood" role="group" aria-label="Mood and switches">
      {map.moods.length > 1 && map.moods.map((m) => (
        <button key={m.id} type="button" className={map.mood === m.id ? 'on' : ''} aria-pressed={map.mood === m.id} onClick={() => void gmRun('gm.map.mood', { map: map.id, mood: m.id })}>
          {m.label}
        </button>
      ))}
      {liveSwitches(map).map((s) => {
        const v = map.values[s.id] ?? 0
        return (
          <button key={s.id} type="button" className={'r10-sw' + (v ? ' on' : '')} aria-pressed={v > 0} onClick={() => void pressSwitch(map, s)}>
            {switchLabel(s, v)}
          </button>
        )
      })}
      {!!map.pins?.length && (
        <button type="button" className={'r10-sw' + (pins ? ' on' : '')} aria-pressed={pins} title="The Key board's pins. Only you see them." onClick={() => setPins(!pins)}>
          What's where
        </button>
      )}
    </div>
  )
}
