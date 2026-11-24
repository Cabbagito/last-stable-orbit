// Bot bay racing: the track, the simulation and the race director, ported exactly from the prototype
// (the canvas LSO — Bot bay racing, https://claude.ai/artifact/5r9V3M158fam1CqMDdEKgn, race.js). The drawing is in
// draw.ts. A race is decided by its seed and entries: stepped at a fixed 1/60 s, the same seed and entries give the
// same race on every screen, so the TV can catch up from the server's seed and start time after a reload.
// sim.test.ts checks this file against the prototype's own code (proto.fixture.json) and checks the balance.

export interface Look {
  spoiler: number
  stripes: number
  wheels: number
  topper: number
  face: number
  paint: number
  lights: number
}

/** One bot on the grid: what it looks like, and the four numbers the race reads (grip, fuel, launch, and the fuel's quirks). */
export interface Entry {
  id: string
  name: string
  color: string
  look?: Look
  num?: string
  grip: number // the tune: 0.7 loose wheel to 1.3 glued, plus the fuel's
  fuel: number // a top-speed factor, 1 for nothing burned
  launch: number // the rev: 0.2, 0.6, 1, or -1 for a stall on the line
  chaos?: boolean // a gamble: once, 12 to 26 s in, a boost or a stall
  stink?: boolean // nobody slipstreams behind it
  csat?: boolean // CSAT-1, the champion
}

export type BotState = 'run' | 'spin' | 'stall' | 'flip' | 'survey'

export interface Bot extends Entry {
  s: number // distance along the track, in world units; a lap is track.L
  lane: number
  laneT: number
  v: number
  st: BotState
  tmr: number
  boost: number
  boostK: number
  heatT: number
  fin: number
  place: number
  pace: number
  chaosAt: number
  surveys: number[]
  seen: Record<string, 1>
  started?: boolean
  slip?: boolean
}

export interface Pop {
  b: Bot
  word: string
  t: number
  heard?: boolean
}

export interface Track {
  L: number
  pts: [number, number][]
  at: (s: number, lane?: number) => { X: number; Y: number; tx: number; ty: number }
  curv: (s: number) => number
}

export interface Race {
  track: Track
  t: number
  laps: number
  total: number
  rnd: () => number
  final: boolean
  lines: [number, string][]
  line: string
  hazards: { s: number; lane: number; until: number; live: boolean }[]
  puddles: { p: number; lane: number; id: number }[]
  placed: number
  over: boolean
  slow: number
  nextEv: number
  lead: Bot | null
  leadSay: number
  guard: { t: number; dur: number } | null
  cleaner: { t: number; dur: number; p: number } | null
  used: Record<string, 1>
  pops: Pop[]
  bots: Bot[]
  winner?: Bot
  photo?: boolean
  wall: number // wall-clock seconds this race has run, from the lights (see advance)
  say: (text: string) => void
  pop: (b: Bot, word: string) => void
}

// ---- the lap: round the dispatch desk in the Bot bays, in the map's world units ----
export const LAPPTS: [number, number][] = [[12, 11.9], [7.4, 11.9], [6.7, 11.6], [6.4, 10.9], [6.4, 7.3], [6.7, 6.6], [7.4, 6.3], [9.6, 6.3], [10.4, 6.6], [10.8, 7.4], [11.3, 8.2], [12.1, 8.6], [14.4, 8.6], [15.0, 8.9], [15.2, 9.6], [15.2, 10.9], [14.9, 11.6], [14.2, 11.9]]
export const WHERE = ['ON THE CRADLE STRAIGHT', 'AT BIN CORNER', 'UP THE ALLEY', 'BY THE BOILER', 'IN THE CHICANE', 'ON THE FRAME STRAIGHT', 'AT DRUM CORNER', 'ON THE CRADLE STRAIGHT']
const BASE = 2.9
export const LIGHTS = 3.3 // seconds of lights before the race clock reaches 0
export const STEP = 1 / 60

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v
}

export function rng(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildTrack(): Track {
  let p = LAPPTS
  for (let it = 0; it < 2; it++) {
    const q: [number, number][] = []
    for (let i = 0; i < p.length; i++) {
      const a = p[i]
      const b = p[(i + 1) % p.length]
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    p = q
  }
  const cum = [0]
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const L = cum[p.length]
  const at = function (s: number, lane?: number) {
    s = ((s % L) + L) % L
    let i = 0
    while (i < p.length - 1 && cum[i + 1] < s) i++
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const seg = cum[i + 1] - cum[i]
    const f = seg ? (s - cum[i]) / seg : 0
    const tx = (b[0] - a[0]) / (seg || 1)
    const ty = (b[1] - a[1]) / (seg || 1)
    return { X: a[0] + (b[0] - a[0]) * f - ty * (lane || 0), Y: a[1] + (b[1] - a[1]) * f + tx * (lane || 0), tx: tx, ty: ty }
  }
  const curv = function (s: number) {
    const a = at(s - 0.1)
    const b = at(s + 0.8)
    let d = Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx)
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    return clamp(Math.abs(d) / 1.1, 0, 1)
  }
  return { L: L, pts: p, at: at, curv: curv }
}

export function newRace(track: Track, entries: Entry[], laps: number, seed: number, isFinal: boolean): Race {
  const rnd = rng(seed)
  const r = {
    track: track, t: -LIGHTS, laps: laps, total: laps * track.L, rnd: rnd, final: !!isFinal, lines: [], line: '', hazards: [], puddles: [], placed: 0,
    over: false, slow: 1, nextEv: 4.5 + rnd() * 2, lead: null, leadSay: 0, guard: null, cleaner: null, used: {}, pops: [], wall: 0,
  } as unknown as Race
  r.bots = entries.map(function (e, i) {
    const b = Object.assign({}, e) as Bot
    b.s = -0.55 - i * 0.5
    b.lane = i % 2 ? 0.3 : -0.3
    b.laneT = b.lane
    b.v = 0
    b.st = 'run'
    b.tmr = 0
    b.boost = 0
    b.boostK = 1
    b.heatT = 0
    b.fin = 0
    b.place = 0
    b.pace = (b.csat ? 1.14 : 1) * (0.985 + rnd() * 0.03)
    b.chaosAt = b.chaos ? 12 + rnd() * 14 : 0
    b.surveys = b.csat ? [9 + rnd() * 5, 21 + rnd() * 5] : []
    b.seen = {}
    return b
  })
  r.say = function (text) {
    r.line = text
    r.lines.push([r.t, text])
  }
  r.pop = function (b, word) {
    r.pops.push({ b: b, word: word, t: r.t })
  }
  return r
}

export function ranked(r: Race) {
  return r.bots.slice().sort(function (a, b) {
    return (a.place || 99) - (b.place || 99) || b.s - a.s
  })
}

export function lapOf(r: Race) {
  const lead = ranked(r)[0]
  return clamp(Math.floor(Math.max(0, lead.s) / r.track.L) + 1, 1, r.laps)
}

function director(r: Race) {
  const rnd = r.rnd
  const order = ranked(r)
  const live = order.filter(function (b) {
    return !b.place && b.st === 'run'
  })
  if (live.length < 1) return
  const lead = order[0]
  if (lead.s > r.total - 7) return
  const pick = function (w: (b: Bot) => number) {
    let tot = 0
    live.forEach(function (b) {
      tot += w(b)
    })
    let x = rnd() * tot
    for (let i = 0; i < live.length; i++) {
      x -= w(live[i])
      if (x <= 0) return live[i]
    }
    return live[live.length - 1]
  }
  const opts: [string, number][] = [['surge', 3], ['spin', 3], ['heat', 2], ['flip', 1.4], ['bottle', 1.6]]
  if (!r.final) {
    opts.push(['tangle', 1.3])
    if (!r.used.cleaner) opts.push(['cleaner', 1.3])
    if (!r.used.guard && r.t > 14 && lead.s < r.total * 0.7) opts.push(['guard', 3.2])
  }
  let tot = 0
  opts.forEach(function (o) {
    tot += o[1]
  })
  let x = rnd() * tot
  let ev = opts[0][0]
  for (let i = 0; i < opts.length; i++) {
    x -= opts[i][1]
    if (x <= 0) {
      ev = opts[i][0]
      break
    }
  }
  if (ev === 'surge') {
    const b = pick(function (b) {
      return b === lead ? 0.4 : 1.5
    })
    b.boost = 2.4
    b.boostK = 1.5
    r.pop(b, 'SURGE')
    r.say(b.name + ' ROLLS OVER A LIVE CRADLE. SURGE!')
  } else if (ev === 'spin') {
    const b = pick(function (b) {
      return 1.3 - b.grip * 0.6
    })
    b.st = 'spin'
    b.tmr = 1.3
    r.pop(b, 'SPIN')
    r.puddles.push({ p: ((b.s % r.track.L) + r.track.L) % r.track.L, lane: b.lane, id: r.puddles.length })
    b.seen['p' + (r.puddles.length - 1)] = 1
    r.say(rnd() < 0.5 ? b.name + ' FINDS THE BROTH. ROUND AND ROUND.' : 'OH NO. NOT THE BROTH. ' + b.name + ' IS SPINNING.')
  } else if (ev === 'heat') {
    const b = pick(function (b) {
      return b.fuel > 1.03 ? 2 : 1
    })
    b.heatT = 3
    r.pop(b, 'HOT')
    r.say(b.name + " IS COOKING. THAT'S NOT STEAM.")
  } else if (ev === 'flip') {
    const b = pick(function (b) {
      return Math.max(0.2, 1.5 - b.grip)
    })
    b.st = 'flip'
    b.tmr = 2.4
    r.pop(b, 'FLIPPED')
    r.say(b.name + ' IS ON ITS BACK. SOMEBODY KICK IT.')
  } else if (ev === 'bottle') {
    r.hazards.push({ s: lead.s + 4 + rnd() * 2, lane: lead.lane, until: r.t + 7, live: true })
    r.say('BOTTLE ON THE TRACK! WHO THREW THAT?')
  } else if (ev === 'tangle') {
    let a: Bot | null = null
    let c: Bot | null = null
    for (let i = 0; i < live.length - 1 && !a; i++)
      for (let j = i + 1; j < live.length; j++)
        if (Math.abs(live[i].s - live[j].s) < 0.9) {
          a = live[i]
          c = live[j]
          break
        }
    if (!a || !c) {
      r.nextEv = r.t + 0.6
      return
    }
    a.st = 'spin'
    a.tmr = 0.9
    c.st = 'spin'
    c.tmr = 1.1
    r.pop(a, 'CRUNCH')
    r.say(a.name + ' AND ' + c.name + ' TRADE PAINT. AND MOP WATER.')
  } else if (ev === 'cleaner') {
    r.used.cleaner = 1
    r.cleaner = { t: 0, dur: 4.2, p: 3.2 }
    r.say('UNIT 12 IS STILL ON SHIFT. IT DOES NOT CARE.')
  } else if (ev === 'guard') {
    r.used.guard = 1
    r.guard = { t: 2.8, dur: 2.8 }
    r.say('GUARD! EVERYBODY CLEAN SOMETHING.')
  }
}

export function step(r: Race, dt: number) {
  r.t += dt
  if (r.t < 0 || r.over) return
  const tr = r.track
  const rnd = r.rnd
  if (r.guard) {
    r.guard.t -= dt
    if (r.guard.t <= 0) {
      r.guard = null
      r.say("...HE'S GONE. GO GO GO.")
    }
    return
  }
  if (r.cleaner) {
    r.cleaner.t += dt
    if (r.cleaner.t > r.cleaner.dur) r.cleaner = null
  }
  const order = ranked(r)
  const lead = order[0]
  for (let i = 0; i < r.bots.length; i++) {
    const b = r.bots[i]
    const prev = b.s
    if (!b.started) {
      b.started = true
      if (b.launch < 0) {
        b.st = 'stall'
        b.tmr = 1.3
        r.pop(b, 'STALLED')
        r.say(b.name + ' STALLS ON THE LINE. TOO MUCH REV.')
      } else b.v = 0.5 + 2.1 * b.launch
    }
    if (b.st !== 'run') {
      b.tmr -= dt
      if (b.tmr <= 0) {
        if (b.st === 'flip') r.say('A KIND BOOT. ' + b.name + ' IS BACK.')
        if (b.st === 'survey') r.say('SURVEY COMPLETE. CSAT-1 RESUMES.')
        b.st = 'run'
      }
    }
    if (b.chaosAt && r.t >= b.chaosAt && b.st === 'run' && !b.place) {
      b.chaosAt = 0
      if (rnd() < 0.5) {
        b.boost = 3.2
        b.boostK = 1.7
        r.pop(b, 'NOODLES!')
        r.say('THE NOODLES KICK IN. ' + b.name + ' IS FLYING.')
      } else {
        b.st = 'stall'
        b.tmr = 2.3
        b.heatT = 2.3
        r.pop(b, 'NOODLES...')
        r.say('THE NOODLES WERE A MISTAKE. ' + b.name + ' IS SMOKING.')
      }
    }
    if (b.surveys.length && r.t >= b.surveys[0] && b.st === 'run' && !b.place && b.s < r.total - 5) {
      b.surveys.shift()
      b.st = 'survey'
      b.tmr = 2.1
      r.pop(b, 'SURVEY')
      r.say('CSAT-1 HAS STOPPED TO CONDUCT A SURVEY.')
    }
    let vt = BASE * b.pace * b.fuel
    vt *= 1 - (0.4 - 0.07 * (b.grip - 1)) * tr.curv(b.s)
    if (b.boost > 0) {
      b.boost -= dt
      vt *= b.boostK
    }
    if (b.heatT > 0) {
      b.heatT -= dt
      vt *= 0.6
    }
    if (!b.place) vt *= 1 + 0.09 * clamp((lead.s - b.s) / 6, 0, 1) - (b === lead ? 0.015 : 0)
    b.slip = false
    for (let j = 0; j < r.bots.length; j++) {
      const o = r.bots[j]
      const gap = o.s - b.s
      if (o !== b && !o.stink && gap > 0.35 && gap < 1.3 && Math.abs(o.lane - b.lane) < 0.35) b.slip = true
    }
    if (b.slip) vt *= 1.05
    if (r.cleaner && !b.place) {
      const d = (r.cleaner.p - (b.s % tr.L) + tr.L) % tr.L
      if (d < 1.1 && Math.abs(r.cleaner.t - r.cleaner.dur / 2) < 1.2) vt *= 0.25
    }
    if (b.st === 'spin') vt *= 0.15
    if (b.st === 'stall' || b.st === 'flip' || b.st === 'survey') vt = 0
    if (b.place) vt = Math.max(0, b.v - 1.6 * dt)
    b.v += clamp(vt - b.v, -7 * dt, 2.6 * dt)
    b.s += b.v * dt
    // keep out of the back of whoever's just ahead
    for (let j = 0; j < r.bots.length; j++) {
      const o = r.bots[j]
      const gap = o.s - b.s
      if (o !== b && gap > 0 && gap < 0.7 && Math.abs(o.lane - b.lane) < 0.3) b.laneT = o.lane > 0 ? -0.32 : 0.32
    }
    b.lane += clamp(b.laneT - b.lane, -0.9 * dt, 0.9 * dt)
    // what's lying on the track
    for (let k = 0; k < r.hazards.length; k++) {
      const h = r.hazards[k]
      if (h.live && r.t > h.until) h.live = false
      if (h.live && prev < h.s && b.s >= h.s && b.st === 'run') {
        if (rnd() < 0.55 - 0.3 * (b.grip - 0.7)) {
          h.live = false
          b.st = 'spin'
          b.tmr = 1.1
          r.pop(b, 'CLINK')
          r.say(b.name + ' TAKES THE BOTTLE. THE BOTTLE WINS.')
        } else {
          b.laneT = h.lane > 0 ? -0.34 : 0.34
          b.v *= 0.86
        }
      }
    }
    for (let k = 0; k < r.puddles.length; k++) {
      const pd = r.puddles[k]
      const a = ((prev % tr.L) + tr.L) % tr.L
      const c = ((b.s % tr.L) + tr.L) % tr.L
      if (!b.seen['p' + pd.id] && b.st === 'run' && a < pd.p && c >= pd.p && Math.abs(b.lane - pd.lane) < 0.35) {
        b.seen['p' + pd.id] = 1
        if (rnd() < 0.4 - 0.3 * (b.grip - 0.7)) {
          b.st = 'spin'
          b.tmr = 1.0
          r.pop(b, 'SPIN')
          r.say(b.name + ' FINDS THE SAME PUDDLE.')
        }
      }
    }
    if (!b.place && b.s >= r.total) {
      b.place = ++r.placed
      b.fin = r.t
      if (b.place === 1) {
        r.winner = b
        r.say(b.name + ' TAKES THE FLAG!')
        // beaten, the champion comes apart at the line
        const champ = r.final && !b.csat ? r.bots.filter((x) => x.csat)[0] : null
        if (champ) {
          champ.st = 'flip'
          champ.tmr = 999
          champ.heatT = 999
          champ.place = ++r.placed
          champ.fin = r.t
          r.pop(champ, 'BROKEN')
          r.say(b.name + ' TAKES THE FLAG! CSAT-1 COMES APART.')
        }
      }
    }
  }
  // the call
  const now = ranked(r)
  const l2 = now[0]
  if (!l2.place) {
    if (r.lead && r.lead !== l2 && r.t - r.leadSay > 3.5 && r.t > 3) {
      r.leadSay = r.t
      r.say(l2.name + ' TAKES THE LEAD ' + WHERE[Math.floor((((l2.s % tr.L) + tr.L) % tr.L) / tr.L * WHERE.length)] + '.')
    }
    r.lead = l2
    if (!r.used.last && r.laps > 1 && l2.s >= r.total - tr.L) {
      r.used.last = 1
      r.say('LAST LAP!')
    }
    if (!r.used.photo && now.length > 1 && l2.s > r.total - 2.4 && now[1].s > l2.s - 0.5) {
      r.used.photo = 1
      r.slow = 0.33
      r.photo = true
      r.say('PHOTO FINISH!')
    }
  }
  if (r.photo && r.winner && r.t > r.winner.fin + 0.25) {
    r.slow = 1
    r.photo = false
  }
  if (r.t >= r.nextEv) {
    r.nextEv = r.t + 3.0 + rnd() * 2.6
    director(r)
  }
  if (r.winner && (r.placed === r.bots.length || r.t > r.winner.fin + 6)) {
    ranked(r).forEach(function (b) {
      if (!b.place) b.place = ++r.placed
    })
    r.over = true
  }
}

/**
 * Run the race up to `wall` seconds of real time after the lights came on. Real time and race time differ only in the
 * photo finish, which slows the race to a third: each 1/60 s step takes (1/60) / slow of real time, exactly as the
 * prototype's frame loop spends it. Live, the TV calls this every frame; after a reload it calls it once and the race
 * is where it would have been.
 */
export function advance(r: Race, wall: number, onStep?: (r: Race) => void) {
  while (!r.over && r.wall + STEP / r.slow <= wall) {
    r.wall += STEP / r.slow
    step(r, STEP)
    onStep?.(r)
  }
}

/** The whole race at once, for the tests: who placed where, and the real time it ended at, from the lights. */
export function runToEnd(entries: Entry[], laps: number, seed: number, isFinal: boolean, track = buildTrack()) {
  const r = newRace(track, entries, laps, seed, isFinal)
  advance(r, 1e9)
  return r
}
