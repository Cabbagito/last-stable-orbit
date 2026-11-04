// Parity: the ported RollFX must paint exactly what R6's original paints. Both run against a canvas that
// records every call and property write; identical logs mean identical pixels.
import { describe, expect, it } from 'vitest'
import r6 from '../../../design/reference/ui/R6.dc.html?raw'
import { RollFX } from './rollfx'
import type { RollPlan, RollPlanInput } from './rollfx'

type FX = typeof RollFX

class Path2DStub {
  constructor(public d: string) {}
}
;(globalThis as unknown as { Path2D: unknown }).Path2D ??= Path2DStub

function original(): FX {
  const a = r6.indexOf('const RollFX = (function () {')
  const b = r6.indexOf('})();', a) + '})();'.length
  return new Function(r6.slice(a, b) + '\nreturn RollFX;')() as FX
}

function recorder() {
  const log: string[] = []
  const props: Record<string, unknown> = {}
  let gid = 0
  const fmt = (v: unknown): string =>
    v instanceof Path2DStub ? `path(${v.d})` : typeof v === 'object' && v && '__id' in v ? String((v as { __id: string }).__id) : JSON.stringify(v)
  const ctx = new Proxy(
    {},
    {
      has: () => true,
      get(_, k: string) {
        if (k === 'measureText')
          return (s: string) => ({ width: String(s).length * parseFloat(/([\d.]+)px/.exec(String(props.font))?.[1] ?? '10') * 0.5 })
        if (k === 'getTransform') return () => ({ a: 1 })
        if (k === 'createRadialGradient')
          return (...a: unknown[]) => {
            const g = { __id: `g${gid++}`, addColorStop: (o: number, c: string) => log.push(`${g.__id}.stop(${o},${c})`) }
            log.push(`${g.__id}=grad(${a.map(fmt).join(',')})`)
            return g
          }
        if (k in props) return props[k]
        return (...a: unknown[]) => log.push(`${k}(${a.map(fmt).join(',')})`)
      },
      set(_, k: string, v) {
        props[k] = v
        log.push(`${k}=${fmt(v)}`)
        return true
      },
    },
  )
  return { ctx: ctx as CanvasRenderingContext2D, log }
}

function paint(fx: FX, plan: RollPlan, t: number, extra?: { spent?: number; wait?: number }) {
  const { ctx, log } = recorder()
  fx.draw(ctx, 1440, 860, plan, t, extra)
  return log
}

function firstDiff(a: string[], b: string[]): string | null {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `call ${i}: R6 ${a[i]} / port ${b[i]}`
  return null
}

const MODES: [RollPlanInput['mode'], string][] = [
  ['slam', '#ff8a55'],
  ['reel', '#ffd166'],
  ['decrypt', '#5ff2ff'],
  ['solve', '#9dbdff'],
  ['fade', '#c79bff'],
  ['pulse', '#ff7dbc'],
]
const CASES = [
  { rolls: [7], sides: 10, bonus: 0 },
  { rolls: [10, 3], sides: 10, bonus: 0 },
  { rolls: [1], sides: 10, bonus: 0 },
  { rolls: [20, 20, 5], sides: 20, bonus: 2 },
  { rolls: [4, 4, 4, 4, 4, 4], sides: 4, bonus: 0 },
]

describe('RollFX port matches R6', () => {
  const R6 = original()
  for (const [mode, color] of MODES) {
    it(`${mode}: every frame, explosions, natural 1, push`, () => {
      for (const c of CASES) {
        for (const seed of [7, 912345]) {
          const input: RollPlanInput = { mode, ...c, seed, color, style: 'custom', aspect: 1.6 }
          const a = R6.plan(input)
          const b = RollFX.plan({ ...input, handle: 'ves', insult: a.insult })
          expect([b.T, b.total, b.fail, b.gates, b.insult]).toEqual([a.T, a.total, a.fail, a.gates, a.insult])
          const times = [...Array.from({ length: 16 }, (_, i) => (a.T * i) / 15), ...a.gates, 1e6]
          for (const t of times) expect(firstDiff(paint(R6, a, t), paint(RollFX, b, t)), `${mode} ${c.rolls} seed ${seed} t ${t}`).toBeNull()
          expect(firstDiff(paint(R6, a, 1e6, { spent: 2 }), paint(RollFX, b, 1e6, { spent: 2 }))).toBeNull()
          for (const g of a.gates) expect(firstDiff(paint(R6, a, g, { wait: 0.5 }), paint(RollFX, b, g, { wait: 0.5 }))).toBeNull()
        }
      }
    })
  }

  it("the terminal shows the roller's handle", () => {
    const plan = RollFX.plan({ mode: 'decrypt', rolls: [7], sides: 10, seed: 3, color: '#5ff2ff', style: 'custom', handle: 'tally' })
    const log = [0.5, 1.5, 2.6, 3.3].flatMap((t) => paint(RollFX, plan, t)).join('\n')
    expect(log).toContain('tally@ergo:~$')
    expect(log).not.toContain('ves@ergo')
  })

  it('a natural 1 slams the insult it was given', () => {
    const plan = RollFX.plan({ mode: 'slam', rolls: [1], sides: 6, seed: 3, color: '#ff8a55', style: 'custom', insult: 'YOU LOST TO A DOOR.' })
    expect(plan.fail).toBe(true)
    expect(paint(RollFX, plan, plan.T).join('\n')).toContain('fillText("A DOOR."')
  })
})
