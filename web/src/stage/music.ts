// Sound files on the TV, through the context its start click unlocked: one-shot effects at a volume, and one song at a
// time that loops without a gap. A song is decoded into a buffer and the buffer loops, never an <audio> element: an
// MP3 is padded at both ends and the gap is audible. Ship songs as FLAC (or WAV) cut to exactly one loop.

export class TvAudio {
  private bufs = new Map<string, Promise<AudioBuffer | null>>()
  private song: { src: string; node: AudioBufferSourceNode | null; gain: GainNode } | null = null
  private ac: AudioContext

  constructor(ac: AudioContext) {
    this.ac = ac
  }

  /** Fetch and decode ahead, so it plays the moment it's asked for. */
  load(src: string): Promise<AudioBuffer | null> {
    let b = this.bufs.get(src)
    if (!b) {
      b = fetch(src)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(src))))
        .then((bytes) => this.ac.decodeAudioData(bytes))
        .catch(() => {
          this.bufs.delete(src) // the next ask tries again
          return null
        })
      this.bufs.set(src, b)
    }
    return b
  }

  /** Once, `delay` seconds from now. A sound that isn't decoded yet plays when it is, if that's still soon. */
  play(src: string, volume = 0.9, delay = 0) {
    const asked = this.ac.currentTime
    void this.load(src).then((buf) => {
      const late = this.ac.currentTime - asked
      if (!buf || late > 1.5) return
      const s = this.ac.createBufferSource()
      const g = this.ac.createGain()
      s.buffer = buf
      g.gain.value = volume
      s.connect(g)
      g.connect(this.ac.destination)
      s.start(this.ac.currentTime + Math.max(0, delay - late))
    })
  }

  /** Loop this song from `offset()` seconds in, replacing whatever was looping. */
  loop(src: string, volume: number, offset: () => number) {
    this.stop()
    const gain = this.ac.createGain()
    gain.gain.value = volume
    gain.connect(this.ac.destination)
    const song: { src: string; node: AudioBufferSourceNode | null; gain: GainNode } = { src, node: null, gain }
    this.song = song
    void this.load(src).then((buf) => {
      if (!buf || this.song !== song) return
      const s = this.ac.createBufferSource()
      s.buffer = buf
      s.loop = true // the whole buffer is one loop
      s.connect(gain)
      const at = ((offset() % buf.duration) + buf.duration) % buf.duration
      s.start(0, at)
      song.node = s
    })
  }

  stop() {
    const s = this.song
    this.song = null
    if (!s) return
    try {
      s.node?.stop()
    } catch {
      // never started
    }
    s.gain.disconnect()
  }
}

/**
 * Where in its file a looping track is, `elapsed` seconds after its first bar. It plays through once from the top,
 * opening included, and from then on goes round from `loopFrom` to the end.
 */
export function musicOffset(elapsed: number, length: number, loopFrom: number): number {
  if (elapsed <= 0) return 0
  if (elapsed < length) return elapsed
  const loop = length - loopFrom
  return loop > 0 ? loopFrom + ((elapsed - loopFrom) % loop) : 0
}

/** The deck's volume step (0..10) as a gain. Squared, so each step sounds about as big as the last. */
export const volumeGain = (step: number) => Math.pow(Math.max(0, Math.min(10, step)) / 10, 2)

const OUT = 1.5 // seconds a track takes to go out when nothing says otherwise
const KEEP = 3 // decoded tracks kept: a minute of stereo is about 20 MB once decoded

export interface Cue {
  id: string
  src: string
  loopFrom: number
  /** Server time (s) of its first bar. Ahead of now, it starts then, on the beat. */
  at: number
  /** Seconds it takes to come in. */
  fade: number
}

interface Voice {
  cue: Cue
  node: AudioBufferSourceNode | null
  fadeIn: GainNode
  fadeOut: GainNode
}

const curve = (up: boolean) => Float32Array.from({ length: 33 }, (_, i) => (up ? Math.sin : Math.cos)((i / 32) * (Math.PI / 2)))

/**
 * The Sound deck's music on the TV: one track at a time, looping without a gap, each change a crossfade. It goes
 * straight to the speakers and not through the rolls' compressor, so dice and pads play over it and never push it
 * down. `hold` takes it away while something else has the TV's sound (a film, a Burn, a minigame) and brings it back.
 */
export class DeckMusic {
  private ac: AudioContext
  private now: () => number
  private out: GainNode
  private held: GainNode
  private bytes = new Map<string, Promise<ArrayBuffer | null>>()
  private bufs = new Map<string, Promise<AudioBuffer | null>>()
  private voice: Voice | null = null

  /** `now` is the server's time in seconds: every screen that plays a track is at the same place in it. */
  constructor(ac: AudioContext, now: () => number, volume = 1) {
    this.ac = ac
    this.now = now
    this.out = ac.createGain()
    this.held = ac.createGain()
    this.out.gain.value = volume
    this.held.connect(this.out)
    this.out.connect(ac.destination)
  }

  /** Fetch a track's file ahead. It's decoded only when it's first played. */
  fetch(src: string): Promise<ArrayBuffer | null> {
    let b = this.bytes.get(src)
    if (!b) {
      b = fetch(src)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(src))))
        .catch(() => {
          this.bytes.delete(src) // the next ask tries again
          return null
        })
      this.bytes.set(src, b)
    }
    return b
  }

  private decode(src: string): Promise<AudioBuffer | null> {
    let b = this.bufs.get(src)
    if (b) {
      this.bufs.delete(src) // most recently used goes last
      this.bufs.set(src, b)
      return b
    }
    b = this.fetch(src)
      .then((bytes) => (bytes ? this.ac.decodeAudioData(bytes.slice(0)) : null)) // decoding empties what it's given: hand it a copy
      .catch(() => null)
    void b.then((buf) => !buf && this.bufs.get(src) === b && this.bufs.delete(src))
    this.bufs.set(src, b)
    for (const old of [...this.bufs.keys()].slice(0, -KEEP)) this.bufs.delete(old)
    return b
  }

  volume(v: number) {
    this.out.gain.setTargetAtTime(v, this.ac.currentTime, 0.05)
  }

  hold(on: boolean) {
    this.held.gain.setTargetAtTime(on ? 0 : 1, this.ac.currentTime, on ? 0.1 : 0.35)
  }

  /** What should be playing: a track, or nothing. The same cue again changes nothing. */
  set(cue: Cue | null) {
    const cur = this.voice
    if (cur && cue && cur.cue.id === cue.id && cur.cue.at === cue.at) return
    if (!cur && !cue) return
    const lead = cue ? cue.at - this.now() : 0
    // a cued track finds the one before it already gone (and gone quickly: a bell or a jingle is ringing meanwhile)
    if (cur) this.end(cur, lead > 0.2 ? Math.min(lead, 1) : cue ? Math.max(cue.fade, 0.3) : OUT)
    this.voice = null
    if (!cue) return

    const fadeIn = this.ac.createGain()
    const fadeOut = this.ac.createGain()
    fadeIn.connect(fadeOut)
    fadeOut.connect(this.held)
    const v: Voice = { cue, node: null, fadeIn, fadeOut }
    this.voice = v
    void this.decode(cue.src).then((buf) => {
      if (!buf || this.voice !== v) return
      const s = this.ac.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.loopStart = Math.round(Math.min(cue.loopFrom, buf.duration) * buf.sampleRate) / buf.sampleRate // on a sample: nothing to interpolate
      s.loopEnd = buf.duration
      s.connect(fadeIn)
      const el = this.now() - cue.at
      const t0 = this.ac.currentTime + Math.max(0, -el)
      fadeIn.gain.setValueCurveAtTime(curve(true), t0, Math.max(cue.fade, 0.02)) // never a bare cut in: it would click mid-wave
      s.start(t0, musicOffset(el, buf.duration, s.loopStart))
      v.node = s
    })
  }

  private end(v: Voice, over: number) {
    const t = this.ac.currentTime
    v.fadeOut.gain.setValueCurveAtTime(curve(false), t, over)
    try {
      v.node?.stop(t + over + 0.05)
    } catch {
      // never started
    }
    window.setTimeout(() => v.fadeOut.disconnect(), (over + 0.2) * 1000)
  }

  close() {
    if (this.voice) this.end(this.voice, 0.05)
    this.voice = null
    this.out.disconnect()
  }
}
