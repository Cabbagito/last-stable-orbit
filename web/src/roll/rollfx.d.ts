// Types for rollfx.js (the R6 roll animation, kept as plain JS so it stays verbatim).

export interface RollPlanInput {
  mode: 'slam' | 'reel' | 'decrypt' | 'solve' | 'fade' | 'pulse'
  rolls: number[]
  sides: number
  bonus?: number
  seed: number
  color: string
  style: 'custom' | 'physics'
  aspect?: number
  handle?: string
  insult?: string | null
}

export interface RollPass {
  scene: string
  value: number
  start: number
  dur: number
  hold: number
  star: boolean
  fail: boolean
  gateAt: number | null
}

export interface RollPlan {
  passes: RollPass[]
  total: number
  fail: boolean
  insult: string
  bonus: number
  rolls: number[]
  sides: number
  T: number
  endPasses: number
  needFinal: boolean
  gates: number[]
}

export const RollFX: {
  plan(o: RollPlanInput): RollPlan
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, plan: RollPlan, t: number, extra?: { spent?: number; wait?: number }): void
}
