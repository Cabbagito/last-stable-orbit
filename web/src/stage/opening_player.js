// The opening: the waiting loop, then the film, starting on the next beat after the GM presses go.
//
// Everything runs from one small shared state, in milliseconds on a clock all devices agree on:
//   { loopStartedAt: number | null, filmStartAt: number | null }
// The GM's device sets loopStartedAt when the loop starts, and filmStartAt (from filmStartFor) when they press go.
// Every device then works out where it should be from that state and the clock alone, so a screen that
// joins late, or reloads, jumps straight to the right place.
//
//   OpeningAudio   plays the sound. Use it only on the GM's device.
//   OpeningScreen  plays the pictures in two stacked <video> elements. Use it on the Stage (and on the GM's device for a preview).
//
// Files:
//   opening_loop.mp4     12 s, no sound. Loops cleanly; its first frame is the film's first frame.
//   opening_film.mp4     the film (opening_animatic3.mp4). Played muted: its sound comes from opening_audio.flac.
//   opening_audio.flac   the 96 s music loop, then the film's sound (music, whip, chime), back to back.
//
// The film's first 1.25 s are the loop's still frame, so a screen that starts the film up to a second late looks exactly right.

export const OPENING = {
  BEAT: 0.75,          // Aphelion is exactly 80 bpm
  BAR: 3.0,
  LOOP: 96,            // the music loop, in seconds: 32 bars. Its start is a downbeat
  VIDEO_LOOP: 12,      // the picture loop: 4 bars, so it stays in step with the music
  FILM: 212.25,        // the film, ending on 5 s of black
  FILM_STILL: 1.25,    // how long the film holds the loop's frame before the camera moves
  FADE: 0.35,          // the loop's sound fades out over this, starting on the beat the film starts
};

// When the film should start: the first beat (or bar) of the loop after the press, at least `lead` seconds away.
// All times are ms on the shared clock.
export function filmStartFor(loopStartedAt, pressedAt, { quantum = 'beat', lead = 0.12 } = {}) {
  const q = (quantum === 'bar' ? OPENING.BAR : OPENING.BEAT) * 1000;
  const e = Math.max(0, pressedAt + lead * 1000 - loopStartedAt);
  return loopStartedAt + Math.ceil(e / q) * q;
}

export function phaseAt(state, now) {
  if (!state || state.loopStartedAt == null) return 'idle';
  if (state.filmStartAt == null || now < state.filmStartAt) return 'loop';
  return now - state.filmStartAt < OPENING.FILM * 1000 ? 'film' : 'done';
}

// ---------------------------------------------------------------- sound (GM's device only)
export class OpeningAudio {
  // now: the shared clock, in ms. Defaults to this device's own clock.
  constructor({ url = 'opening_audio.flac', now = () => Date.now(), ctx = null, volume = 1 } = {}) {
    this.url = url; this.now = now;
    this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.out = this.ctx.createGain(); this.out.gain.value = volume; this.out.connect(this.ctx.destination);
    this.buffer = null; this.loop = null; this.film = null; this.applied = null;
  }
  async load() {
    if (this.buffer) return;
    if (location.protocol === 'file:') throw new Error('the sound cannot load from a file opened from disk: serve the folder over http (see README)');
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`could not fetch ${this.url} (${res.status})`);
    const data = await res.arrayBuffer();
    this.buffer = await new Promise((ok, bad) => this.ctx.decodeAudioData(data, ok, e => bad(new Error(`this browser could not decode ${this.url}: ${e?.message || e}`))));
    if (Math.abs(this.buffer.duration - OPENING.LOOP - OPENING.FILM) > 0.05) console.warn('opening_audio has an unexpected length', this.buffer.duration);
  }
  // Browsers only allow sound after a click: call this from the GM's click handler.
  unlock() { return this.ctx.resume(); }

  // The audio clock's time for a moment on the shared clock.
  ctxTime(ms) {
    const c = this.ctx; let ct = c.currentTime, pt = performance.now();
    const ts = c.getOutputTimestamp && c.getOutputTimestamp();
    if (ts && ts.contextTime > 0) { ct = ts.contextTime; pt = ts.performanceTime; }
    else pt -= ((c.outputLatency || 0) + (c.baseLatency || 0)) * 1000;
    const sharedAtPt = this.now() - (performance.now() - pt);
    return ct + (ms - sharedAtPt) / 1000;
  }

  // Make the sound match the state. Safe to call as often as you like.
  apply(state) {
    if (!this.buffer) throw new Error('call load() first');
    const a = { loop: state?.loopStartedAt ?? null, film: state?.filmStartAt ?? null }, p = this.applied;
    if (p && p.loop === a.loop && p.film === a.film) return;
    // pressing go only adds the film. Anything else (a new loop, a reset, a cancelled press) starts over
    if (!(p && p.loop === a.loop && p.film == null)) this.stop();
    this.applied = a;
    const phase = phaseAt(state, this.now());
    if (phase === 'idle' || phase === 'done') return;
    const c = this.ctx, T = OPENING;

    if (!this.loop && phase === 'loop') {
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = this.buffer; src.loop = true; src.loopStart = 0; src.loopEnd = T.LOOP;
      src.connect(g).connect(this.out);
      const at = this.ctxTime(state.loopStartedAt), when = Math.max(at, c.currentTime + 0.02);
      src.start(when, ((when - at) % T.LOOP + T.LOOP) % T.LOOP);
      this.loop = { src, g };
    }
    if (!this.film && state.filmStartAt != null) {
      const at = this.ctxTime(state.filmStartAt), when = Math.max(at, c.currentTime + 0.02);
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = this.buffer; src.connect(g).connect(this.out);
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + 0.006);   // no click
      src.start(when, T.LOOP + (when - at));
      this.film = { src, g };
      if (this.loop) {
        const lg = this.loop.g.gain;
        lg.setValueAtTime(1, when);
        lg.setTargetAtTime(0, when, T.FADE / 4);
        this.loop.src.stop(when + T.FADE * 2);
      }
    }
  }
  stop() {
    for (const s of [this.loop, this.film]) if (s) { try { s.src.stop(); } catch (e) {} s.src.disconnect(); }
    this.loop = this.film = null;
  }
}

// ---------------------------------------------------------------- pictures (Stage, and any preview)
// loopVideo and filmVideo: two <video> elements, same size, film stacked on top of loop.
export class OpeningScreen {
  constructor({ loopVideo, filmVideo, now = () => Date.now(), onEnd = null }) {
    this.L = loopVideo; this.F = filmVideo; this.now = now; this.onEnd = onEnd; this.state = null; this.ended = false;
    for (const v of [this.L, this.F]) { v.muted = true; v.playsInline = true; v.preload = 'auto'; v.controls = false; }
    this.L.loop = true; this.F.loop = false;
    this.F.style.opacity = '0';
    this.tick = this.tick.bind(this); this.raf = requestAnimationFrame(this.tick);
  }
  apply(state) {
    if (state?.filmStartAt !== this.state?.filmStartAt || state?.loopStartedAt !== this.state?.loopStartedAt) this.ended = false;
    this.state = state;
  }
  destroy() { cancelAnimationFrame(this.raf); this.L.pause(); this.F.pause(); }

  tick() {
    this.raf = requestAnimationFrame(this.tick);
    const s = this.state, now = this.now(), phase = phaseAt(s, now), T = OPENING;
    if (phase === 'idle') {
      // the still, waiting for the GM
      this.F.style.opacity = '0'; if (!this.F.paused) this.F.pause();
      if (!this.L.paused) this.L.pause();
      if (this.L.readyState >= 1 && this.L.currentTime !== 0) this.L.currentTime = 0;
      return;
    }
    if (phase === 'loop' || (phase === 'film' && this.F.style.opacity === '0')) {
      // the loop. Its pictures barely move, so it only needs to be roughly in step
      const want = (((now - s.loopStartedAt) / 1000) % T.VIDEO_LOOP + T.VIDEO_LOOP) % T.VIDEO_LOOP;
      if (this.L.paused) this.L.play().catch(() => {});
      const d = Math.abs(this.L.currentTime - want);
      if (Math.min(d, T.VIDEO_LOOP - d) > 0.5 && !this.L.seeking) this.L.currentTime = want;
    }
    if (s.filmStartAt == null) return;
    const t = (now - s.filmStartAt) / 1000;
    if (t < -1.5) return;
    if (t < 0) {
      // get the film ready on its first frame
      if (!this.F.paused) this.F.pause();
      if (this.F.readyState >= 1 && this.F.currentTime > 0.05 && !this.F.seeking) this.F.currentTime = 0;
      return;
    }
    if (t >= T.FILM) {
      if (!this.ended) { this.ended = true; this.F.pause(); this.onEnd && this.onEnd(); }
      return;
    }
    // the film: keep it on the shared clock
    if (this.F.paused) { if (t > 0.3 && !this.F.seeking) this.F.currentTime = t; this.F.play().catch(() => {}); }
    const d = t - this.F.currentTime;
    if (Math.abs(d) > 0.3 && !this.F.seeking) { this.F.currentTime = t; this.F.playbackRate = 1; }
    else this.F.playbackRate = Math.abs(d) < 0.02 ? 1 : 1 + Math.max(-0.08, Math.min(0.08, d * 0.8));
    // show it once it is really playing: before 1.25 s it looks exactly like the loop anyway
    if (this.F.style.opacity === '0' && !this.F.paused && !this.F.seeking && this.F.currentTime > 0.04 && (this.F.currentTime < T.FILM_STILL || Math.abs(d) < 0.1)) {
      this.F.style.opacity = '1'; this.L.pause();
    }
  }
}
