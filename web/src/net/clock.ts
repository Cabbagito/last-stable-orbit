// The server's clock, as seen from here. Films start at one server moment on every screen that plays them, so
// each screen needs to know how far its own clock is from the server's. Every pong carries the server's time:
// the one with the shortest round trip gives the best estimate. View frames give a rougher one until then.

let skew = 0 // server ms minus local ms
let bestRtt = Infinity

export const serverClock = {
  /** The server's time now, in ms. */
  now: () => Date.now() + skew,
  /** A pong: `serverNow` (s) answered a ping sent at `sent` and received at `got` (local ms). */
  fromPong(serverNow: number, sent: number, got: number) {
    const rtt = got - sent
    if (rtt < 0 || rtt > bestRtt) return
    bestRtt = rtt
    skew = serverNow * 1000 - (sent + rtt / 2)
  },
  /** A view frame: good to within one trip, until a pong does better. */
  fromFrame(serverNow: number, got: number) {
    if (bestRtt === Infinity) skew = serverNow * 1000 - got
  },
  /** A new connection may be on a different network path: measure again. */
  reset() {
    bestRtt = Infinity
  },
}
