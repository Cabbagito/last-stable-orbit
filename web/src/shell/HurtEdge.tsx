import { useGame } from '../store/game'

/** How hurt someone looks: 'hurt' at two thirds of their health or less, 'down' at 0. The server swaps the portrait
 * by the same rule (views._face). */
export function hurtStage(hp: number, health: number): 'hurt' | 'down' | null {
  if (hp <= 0) return 'down'
  return hp * 3 <= health * 2 ? 'hurt' : null
}

/**
 * The red screen edge (the LSO — Hurt portraits canvas, board "Screen edge"): only on the hurt player's own laptop,
 * never the GM's or the TV, and silent. It sits over the map, under the crew rail, cards and banners, so they stay
 * readable. Hurt breathes slowly; down is heavier and faster, and drains the map (`.app-isdown` on the map section).
 */
export function HurtEdge({ stage }: { stage: 'hurt' | 'down' | null }) {
  if (!stage) return null
  return <div key={stage} className={'app-hurtedge ' + stage} aria-hidden="true" />
}

export function useMyStage(): 'hurt' | 'down' | null {
  return useGame((s) => {
    const v = s.view
    if (!v || v.me.role !== 'player') return null
    const me = v.crew.find((c) => c.id === v.me.char)
    return me ? hurtStage(me.hp, me.health) : null
  })
}
