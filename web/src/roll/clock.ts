import type { RollPlan } from './rollfx'

// The roll's clock, R6's Component.loop() without the painting. It decides where the animation is, holds at
// each explosion gate (until "Roll again", or 4 seconds), and reports each die as it lands so everyone else
// sees it. It runs on wall-clock time, so a background tab (no animation frames) can keep it going on a timer
// and the dice still land for the table on time.

export const GATE_WAIT = 4 // seconds an explosion waits for "Roll again"

export interface ClockEvents {
  land: (shown: number) => void // this many dice have landed
  gate: (open: boolean) => void
  done: () => void
}

export interface Frame {
  t: number
  wait: number // > 0 while holding at a gate
}

/** How many dice have landed by time t: each pass shows its number at start + dur. */
export const landedBy = (plan: RollPlan, t: number) => plan.passes.filter((p) => t >= p.start + p.dur).length

export class RollClock {
  done = false
  private t0: number
  private gates: number[]
  private waiting = false
  private gateAt = 0
  private landed = 0

  constructor(
    private plan: RollPlan,
    now: number,
    private on: ClockEvents,
  ) {
    this.t0 = now
    this.gates = plan.gates.slice()
  }

  /** Advance to `now`. Returns the frame to paint (the last one too), or null once it's over. */
  tick(now: number): Frame | null {
    if (this.done) return null
    for (;;) {
      const t = (now - this.t0) / 1000
      const g = this.gates.length ? this.gates[0] : null
      if (g != null && t >= g) {
        // exploded: hold on the gold number until "Roll again", or GATE_WAIT seconds. The wait counts from
        // when the gate was reached, not when a (throttled, background) tick noticed it, so nothing drifts.
        if (!this.waiting) {
          this.waiting = true
          this.gateAt = this.t0 + g * 1000
          this.on.gate(true)
        }
        this.land(landedBy(this.plan, g))
        const w = (now - this.gateAt) / 1000
        if (w > GATE_WAIT) {
          this.resumeAt(this.gateAt + GATE_WAIT * 1000)
          continue // a late tick may catch up through several explosions at once
        }
        return { t: g, wait: w || 0.001 }
      }
      this.land(landedBy(this.plan, t))
      if (t >= this.plan.T) {
        this.land(this.plan.passes.length)
        this.done = true
        this.on.done()
      }
      return { t, wait: 0 }
    }
  }

  /** Holding at an explosion gate. */
  get holding() {
    return this.waiting
  }

  /** Dice landed so far. */
  get landedCount() {
    return this.landed
  }

  /** "Roll again" at an explosion. */
  release(now: number) {
    if (this.waiting) this.resumeAt(now)
  }

  private resumeAt(at: number) {
    const g = this.gates.shift() ?? 0
    this.t0 = at - g * 1000
    this.waiting = false
    this.on.gate(false)
  }

  /** Jump to the end. */
  skip() {
    this.gates = []
    this.waiting = false
    this.t0 -= 1e6
    this.on.gate(false)
  }

  private land(k: number) {
    if (k > this.landed) {
      this.landed = k
      this.on.land(k)
    }
  }
}
