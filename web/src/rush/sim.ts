// Sarge's rush, played out from its seed and the cook's serves: server/lso/rush.py, line for line. The same seed and
// serves give the same shift on the cook's laptop, the TV and the server; sim.test.ts checks it against shifts the
// Python played (sim.fixture.json). All times are whole ms after clocking in.

export interface RushGame {
  shift: number
  rush: [number, number]
  last: number
  gap: number
  tick: number
  first: number
  every: { calm: number; rush: number; after: number }
  patience: { calm: number; rush: number }
  easy: number
  two: number
  three: number
  red: number
  hold: number
  noodles: [string, string][]
  broths: [string, string][]
  toppings: [string, string][]
  gran: { at: number; patience: number; noodle: string; broth: string; toppings: string[] }
  csat: { at: number; patience: number }
  ticket: { number: string; broth: string; gran: { who: string; text: string }; csat: { who: string; text: string } }
  lines: {
    idle: string
    title: string
    clock_in: string
    serve: string
    start: string
    rush: string
    call: string
    call_gran: string
    call_csat: string
    empty: string
    usual: string
    not_usual: string
    droid_served: string
    droid_left: string
    cease: string
    ok: string[]
    bad: string[]
    gone: string[]
  }
  ranks: { min: number; rank: string; line: string; sound: string }[]
}

export interface RushBowl {
  n: string | null
  b: string | null
  t: string[]
}

export interface RushServe extends RushBowl {
  k: number // the cook's own count
  at: number
}

export interface Ticket {
  kind: 'std' | 'gran' | 'csat'
  n: string | null
  b: string | null
  t: string[]
  pat: number
  id: number
  born: number
}

export type CueKind = 'start' | 'ticket' | 'lost' | 'droid_left' | 'ok' | 'wrong' | 'empty' | 'rush' | 'end'

export interface Cue {
  at: number
  kind: CueKind
  key: string
}

export interface Shift {
  el: number
  done: boolean
  slots: (Ticket | null)[]
  bark: string
  red: boolean
  out: number
  wrong: number
  lost: number
  score: number
  rank: string | null
  rush: boolean
  cues: Cue[]
}

/** mulberry32: a small seeded generator, the same as rush.py's. */
export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const ms = (seconds: number) => Math.round(seconds * 1000)

export const ids = (shelf: [string, string][]) => shelf.map((x) => x[0])

export function rankFor(g: RushGame, score: number) {
  return g.ranks.find((r) => score >= r.min) ?? g.ranks[g.ranks.length - 1]
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function simulate(g: RushGame, seed: number, serves: RushServe[], upto: number): Shift {
  const rnd = mulberry32(seed)
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]
  const SHIFT = ms(g.shift), R0 = ms(g.rush[0]), R1 = ms(g.rush[1]), LAST = ms(g.last), GAP = ms(g.gap), TICK = ms(g.tick), RED = ms(g.red)
  const L = g.lines
  const tops = ids(g.toppings)
  const name: Record<string, string> = Object.fromEntries([...g.noodles, ...g.broths, ...g.toppings])
  const slots: (Ticket | null)[] = [null, null, null, null]
  const free = [-9000, -9000, -9000, -9000]
  let next = ms(g.first), count = 0, gran = false, csat = false, rushed = false
  let out = 0, wrong = 0, lost = 0, bark = L.start, redUntil = -1, done = false
  let rank: string | null = null
  const cues: Cue[] = [{ at: 0, kind: 'start', key: 'start' }]
  const cue = (at: number, kind: CueKind, key: string) => cues.push({ at, kind, key })

  const make = (el: number): Ticket => {
    const id = ++count
    if (!gran && el >= ms(g.gran.at)) {
      gran = true
      return { kind: 'gran', n: g.gran.noodle, b: g.gran.broth, t: [...g.gran.toppings], pat: ms(g.gran.patience), id, born: el }
    }
    if (!csat && el >= ms(g.csat.at)) {
      csat = true
      return { kind: 'csat', n: null, b: null, t: [], pat: ms(g.csat.patience), id, born: el }
    }
    const rush = R0 <= el && el < R1
    const k = rush ? (rnd() < g.three ? 3 : 2) : el < ms(g.easy) ? 1 : rnd() < g.two ? 2 : 1
    const pool = [...tops]
    const t: string[] = []
    while (t.length < k) t.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0])
    const n = pick(g.noodles)[0]
    const b = pick(g.broths)[0]
    return { kind: 'std', n, b, t, pat: ms(rush ? g.patience.rush : g.patience.calm), id, born: el }
  }

  const call = (tk: Ticket) => {
    if (tk.kind === 'gran') return L.call_gran.replace('{id}', String(tk.id))
    if (tk.kind === 'csat') return L.call_csat.replace('{id}', String(tk.id))
    return L.call.replace('{id}', String(tk.id)).replace('{noodle}', name[tk.n!]).replace('{broth}', name[tk.b!]).replace('{toppings}', tk.t.map((x) => name[x]).join('. '))
  }

  const tick = (el: number) => {
    const wasRed = el < redUntil
    let reddened = false
    slots.forEach((tk, i) => {
      if (tk && el - tk.born >= tk.pat) {
        free[i] = el
        slots[i] = null
        if (tk.kind === 'csat') {
          bark = L.droid_left
          cue(el, 'droid_left', `l${tk.id}`)
        } else {
          lost++
          bark = pick(L.gone)
          reddened = true
          cue(el, 'lost', `l${tk.id}`)
        }
      }
    })
    if (reddened && !wasRed) redUntil = el + RED
    if (el >= SHIFT) {
      const r = rankFor(g, out - wrong - lost)
      done = true
      slots.fill(null)
      redUntil = -1
      rank = r.rank
      bark = L.cease + r.line
      cue(el, 'end', 'end')
      return
    }
    if (!rushed && el >= R0) {
      rushed = true
      bark = L.rush
      cue(el, 'rush', 'rush')
    }
    if (el >= next && el < LAST) {
      const i = slots.findIndex((tk, j) => !tk && el - free[j] >= GAP)
      if (i >= 0) {
        const tk = make(el)
        slots[i] = tk
        bark = call(tk)
        cue(el, 'ticket', `t${tk.id}`)
        next = el + ms(el >= R1 ? g.every.after : el >= R0 ? g.every.rush : g.every.calm)
      }
    }
  }

  const serve = (sv: RushServe) => {
    const el = sv.at, key = `s${sv.k}`
    const n = sv.n ?? null, b = sv.b ?? null, t = [...(sv.t ?? [])]
    if (!n && !b && !t.length) {
      bark = L.empty
      cue(el, 'empty', key)
      return
    }
    let idx = -1, best: number | null = null
    slots.forEach((tk, i) => {
      if (tk && tk.kind !== 'csat' && tk.n === n && tk.b === b && same(tk.t, t) && (best === null || tk.born < best)) {
        idx = i
        best = tk.born
      }
    })
    if (idx < 0 && n && b) idx = slots.findIndex((tk) => !!tk && tk.kind === 'csat')
    if (idx >= 0) {
      const tk = slots[idx]!
      slots[idx] = null
      free[idx] = el
      if (tk.kind === 'csat') bark = L.droid_served
      else {
        out++
        bark = tk.kind === 'gran' ? L.usual : pick(L.ok)
      }
      cue(el, 'ok', key)
      return
    }
    const open = slots.filter((x): x is Ticket => !!x)
    const onlyGran = open.length > 0 && open.every((x) => x.kind === 'gran')
    wrong++
    redUntil = el + RED
    bark = onlyGran ? L.not_usual : pick(L.bad)
    cue(el, 'wrong', key)
  }

  const queue = [...serves].sort((a, b) => a.at - b.at || a.k - b.k)
  let qi = 0
  for (let k = 1; ; k++) {
    const at = k * TICK
    while (qi < queue.length && queue[qi].at <= Math.min(at, upto) && !done) serve(queue[qi++])
    if (at > upto || done) break
    tick(at)
  }

  return {
    el: Math.min(upto, SHIFT),
    done,
    slots,
    bark,
    red: upto < redUntil,
    out,
    wrong,
    lost,
    score: out - wrong - lost,
    rank,
    rush: !done && R0 <= upto && upto < R1,
    cues,
  }
}
