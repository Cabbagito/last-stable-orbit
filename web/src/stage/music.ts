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
