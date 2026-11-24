// Bot bay racing: run the prototype's own race code and write web/src/race/proto.fixture.json, which sim.test.ts
// checks the app's port (web/src/race/sim.ts) against, race for race.
//
// The prototype is the canvas LSO — Bot bay racing (https://claude.ai/artifact/5r9V3M158fam1CqMDdEKgn), kept as plain
// files in the kit Peter handed over (prototype/source/race.js). Run from the repo root, with Node 22:
//
//     node scripts/race_fixture.mjs <path to prototype/source/race.js>
//
// The prototype's drawing needs a browser; it's stubbed, since only the simulation is compared. Time is spent the way
// the prototype's frame loop spends it: each 1/60 s step takes (1/60) / slow of real time.

import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const src = readFileSync(process.argv[2], 'utf8')
const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true })
const sandbox = {
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) },
  racerSet: () => ({}), // these three live in botart.js: drawing only
  mk: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  R: () => undefined,
  Math,
  Object,
}
vm.createContext(sandbox)
vm.runInContext(src + '\nthis.buildTrack = buildTrack; this.newRace = newRace; this.step = step; this.ranked = ranked;', sandbox)
const { buildTrack, newRace, step, ranked } = sandbox


const HOUSE = ['MOPSY', 'UNIT 9', 'BIG SCRUB', 'DUSTIN', 'SIR SUDS']
const GRIPS = [0.7, 1, 1.15, 1.3]
const FUELS = [{}, { fuel: 1.02 }, { fuel: 1.012 }, { fuel: 0.99 }, { grip: 0.1 }, { grip: -0.15 }, { chaos: true }, { stink: true }]
const LAUNCH = [0.2, 0.6, 1, -1]

// a small generator of its own, so the cases don't depend on the race's
let g = 12345
const pick = (n) => {
  g = (g * 48271) % 2147483647
  return g % n
}

const cases = []
for (let k = 0; k < 40; k++) {
  const final = k % 4 === 3
  const players = final ? 1 : 1 + pick(5)
  const entries = []
  for (let i = 0; i < players; i++) {
    const fx = FUELS[pick(FUELS.length)]
    entries.push({
      id: 'p' + i, name: 'P' + i, color: '#ffffff',
      grip: GRIPS[pick(4)] + (fx.grip || 0), fuel: fx.fuel || 1, launch: LAUNCH[pick(4)],
      ...(fx.chaos ? { chaos: true } : {}), ...(fx.stink ? { stink: true } : {}),
    })
  }
  if (final) entries.push({ id: 'csat', name: 'CSAT-1', color: '#f4ecd4', csat: true, grip: 1.2, fuel: 1, launch: 0.7 })
  else for (let i = 0; entries.length < 5; i++) entries.push({ id: 'house' + i, name: HOUSE[i], color: '#ffffff', grip: 1, fuel: 1, launch: 0.6 })
  const seed = 1 + pick(2147483646)
  const r = newRace(buildTrack(), entries, final ? 3 : 5, seed, final)
  let wall = 0
  while (!r.over) {
    wall += 1 / 60 / r.slow
    step(r, 1 / 60)
  }
  cases.push({
    seed, final, entries,
    result: {
      order: ranked(r).map((b) => b.id),
      fin: r.bots.map((b) => Math.round(b.fin * 1e6) / 1e6),
      wall: Math.round(wall * 1e6) / 1e6,
      lines: r.lines.map((l) => l[1]),
    },
  })
}
writeFileSync('web/src/race/proto.fixture.json', '{"cases": [\n' + cases.map((c) => JSON.stringify(c)).join(',\n') + '\n]}\n')
console.log(`${cases.length} races written`)
