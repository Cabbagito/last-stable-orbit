import { T_HIT } from './godpaint'

// The rolls' sound, from R17Stage. The TV is the only screen that makes any, and it needs its start click first.

type Wave = OscillatorType

export class RollSound {
  private ac: AudioContext | null = null
  private out: AudioNode | null = null
  private noise: AudioBuffer | null = null

  /** The context the start click unlocked: the opening plays through it too. */
  get context() {
    return this.ac
  }

  /** Call from a click: browsers only let sound start from one. */
  unlock() {
    const AC = window.AudioContext
    if (!AC || this.ac) return
    const ac = new AC()
    const n = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate)
    const d = n.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this.noise = n
    const comp = ac.createDynamicsCompressor()
    comp.connect(ac.destination)
    this.out = comp
    this.ac = ac
    void ac.resume()
  }

  close() {
    void this.ac?.close()
    this.ac = null
  }

  private osc(type: Wave, f0: number, f1: number, t0: number, dur: number, g0: number, g1: number, peakAt?: number) {
    const a = this.ac!
    const o = a.createOscillator()
    const g = a.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t0)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    g.gain.setValueAtTime(peakAt ? 0.0001 : g0, t0)
    if (peakAt) g.gain.exponentialRampToValueAtTime(g0, t0 + peakAt)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, g1), t0 + dur)
    o.connect(g)
    g.connect(this.out!)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  }

  private burst(type: BiquadFilterType, f0: number, f1: number, q: number, t0: number, dur: number, g0: number, g1: number, peakAt?: number) {
    const a = this.ac!
    const s = a.createBufferSource()
    const fl = a.createBiquadFilter()
    const g = a.createGain()
    s.buffer = this.noise
    s.loop = true
    fl.type = type
    fl.Q.value = q
    fl.frequency.setValueAtTime(f0, t0)
    fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    g.gain.setValueAtTime(peakAt ? 0.0001 : g0, t0)
    if (peakAt) g.gain.exponentialRampToValueAtTime(g0, t0 + peakAt)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, g1), t0 + dur)
    s.connect(fl)
    fl.connect(g)
    g.connect(this.out!)
    s.start(t0)
    s.stop(t0 + dur + 0.02)
  }

  god(hidden: boolean) {
    if (!this.ac) return
    const a = this.ac
    const t0 = a.currentTime + 0.03
    const T = T_HIT
    // the room going under: a drone that swells until the hit
    ;[37, 37.7, 74.3].forEach((f, i) => {
      const o = a.createOscillator()
      const lp = a.createBiquadFilter()
      const g = a.createGain()
      o.type = 'sawtooth'
      o.frequency.value = f
      lp.type = 'lowpass'
      lp.frequency.value = 170
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(i === 2 ? 0.12 : 0.3, t0 + T)
      g.gain.setValueAtTime(0.12, t0 + T + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + T + 2.7)
      o.connect(lp)
      lp.connect(g)
      g.connect(this.out!)
      o.start(t0)
      o.stop(t0 + T + 2.8)
    })
    // air rushing in
    this.burst('bandpass', 180, 2400, 2.5, t0 + 0.3, T - 0.3, 0.3, 0.28, T - 0.5)
    // a heart, speeding up
    ;[1.9, 1.25, 0.8, 0.46, 0.2].forEach((b) => this.osc('sine', 85, 38, t0 + T - b, 0.22, 0.8, 0.001))
    // the hit
    this.osc('sine', 150, 24, t0 + T, 1.4, 1, 0.001)
    this.burst('lowpass', 2200, 160, 0.7, t0 + T, 1.3, 1, 0.001)
    ;[311, 467, 622, 933].forEach((f) => this.osc('triangle', f, f * 0.99, t0 + T, 3, 0.07, 0.001))
    // hidden: something enormous stays in the room a while, and tells you nothing
    if (hidden) [55, 82.4, 110, 164.8].forEach((f, i) => this.osc('sine', f, f, t0 + T + 0.35, 2.8, 0.1 - i * 0.012, 0.001, 0.5))
  }

  /** Everyone's Reflex at once: the dice go in, tick while they spin, each lands with a knock, and the order is set.
   * `lands` and `sort` are seconds from now. */
  initiative(lands: number[], sort: number) {
    if (!this.ac || !lands.length) return
    const t0 = this.ac.currentTime + 0.02
    const last = Math.max(...lands)
    this.burst('bandpass', 300, 2000, 1.5, t0, 0.3, 0.4, 0.001)
    for (let t = 0.25; t < last; t += 0.08) this.osc('square', 700, 700, t0 + t, 0.03, 0.05, 0.001)
    lands.forEach((s) => {
      this.osc('sine', 190, 42, t0 + s, 0.3, 0.7, 0.001)
      this.burst('lowpass', 3000, 300, 0.7, t0 + s, 0.14, 0.4, 0.001)
    })
    ;[523, 784].forEach((f, i) => this.osc('triangle', f, f, t0 + sort + i * 0.07, 0.35, 0.16, 0.001))
  }

  crew(phase: string, stat: string | null) {
    if (!this.ac) return
    const t0 = this.ac.currentTime + 0.02
    if (phase === 'roll') {
      this.burst('bandpass', 300, 2000, 1.5, t0, 0.3, 0.4, 0.001)
      const f = stat ? { body: 90, reflex: 700, tech: 1200, intel: 500, cool: 300, empathy: 120 }[stat] ?? 90 : 90
      for (let i = 0; i < 20; i++) this.osc('square', f, f, t0 + 0.4 + i * 0.08, 0.03, 0.05, 0.001)
    }
    if (phase === 'land') {
      this.osc('sine', 190, 42, t0, 0.45, 0.9, 0.001)
      this.burst('lowpass', 3000, 300, 0.7, t0, 0.22, 0.6, 0.001)
    }
    if (phase === 'boom') [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, t0 + i * 0.06, 0.5, 0.22, 0.001))
    if (phase === 'nat1') {
      this.osc('sawtooth', 210, 38, t0, 0.8, 0.5, 0.001)
      this.burst('lowpass', 1400, 120, 1, t0, 0.5, 0.8, 0.001)
    }
    if (phase === 'push' || phase === 'repush') this.osc('triangle', 660, 990, t0, 0.16, 0.3, 0.001)
    if (phase === 'seal') {
      this.osc('square', 95, 48, t0, 0.14, 0.4, 0.001)
      this.burst('lowpass', 900, 200, 1, t0, 0.1, 0.6, 0.001)
    }
  }
}
