import { describe, expect, it } from 'vitest'
import fixture from './sim.fixture.json'
import { simulate, type RushGame, type RushServe } from './sim'

// The same shifts the Python played (server/tests/test_rush.py writes sim.fixture.json): the cook's laptop, the TV and
// the server have to agree on every ticket, line and point.
describe("Sarge's rush plays out the same as on the server", () => {
  const g = fixture.game as unknown as RushGame
  for (const c of fixture.cases) {
    it(`seed ${c.seed}, ${c.serves.length} serves, at ${c.upto} ms`, () => {
      expect(simulate(g, c.seed, c.serves as RushServe[], c.upto)).toEqual(c.result)
    })
  }
})
