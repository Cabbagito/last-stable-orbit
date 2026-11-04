import type { StatKey } from '../types'

// Each stat's colours and roll animation, from R6's stats() (col: labels and beams; fx: the animation).
export interface StatLook {
  name: string // BODY
  title: string // Body
  col: string
  fx: string
  mode: 'slam' | 'reel' | 'decrypt' | 'solve' | 'fade' | 'pulse'
}

export const STAT_LOOK: Record<StatKey, StatLook> = {
  body: { name: 'BODY', title: 'Body', col: '#ef7d4a', fx: '#ff8a55', mode: 'slam' },
  reflex: { name: 'REFLEX', title: 'Reflex', col: '#f2c048', fx: '#ffd166', mode: 'reel' },
  tech: { name: 'TECH', title: 'Tech', col: '#46d6f0', fx: '#5ff2ff', mode: 'decrypt' },
  intel: { name: 'INTEL', title: 'Intel', col: '#6f93ff', fx: '#9dbdff', mode: 'solve' },
  cool: { name: 'COOL', title: 'Cool', col: '#a06cff', fx: '#c79bff', mode: 'fade' },
  empathy: { name: 'EMPATHY', title: 'Empathy', col: '#ff5fb0', fx: '#ff7dbc', mode: 'pulse' },
}

export const STEP_UP: Record<number, number> = { 4: 6, 6: 8, 8: 10, 10: 12, 12: 20 }

/** The die a stat rolls, with or without a skill or chrome pick. Mirrors server/lso/rules.py. */
export function effectiveDie(sides: number, stepped: boolean): { sides: number; bonus: number } {
  if (!stepped) return { sides, bonus: 0 }
  if (sides === 20) return { sides: 20, bonus: 2 }
  return { sides: STEP_UP[sides], bonus: 0 }
}

export const statIcon = (s: StatKey) => `/assets/icons/stats/${s}.png`
export const dieIcon = (s: StatKey, sides: number) => `/assets/icons/dice/${s}-d${sides}.png`

// R6's reference ladder. The app never says pass or fail; Peter names the difficulty out loud.
export const LADDER: [string, number][] = [
  ['Easy', 3],
  ['Normal', 5],
  ['Hard', 7],
  ['Very hard', 9],
  ['Heroic', 11],
]
